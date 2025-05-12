// index.js
// AiWA ComplianceBot GitHub App using Probot

/**
 * This file acts as the main entry point for your GitHub App.
 * It listens for specific events and ensures compliance rules are enforced.
 */

const defaultConfig = {
  branchPattern: "^aiwa\\/[a-z0-9\\-]+(\\/.+)?$", // Allows aiwa/feature-name or aiwa/feature-name/sub-task
  branchPatternMessage: "⚠️ Branch name `%BRANCH_NAME%` does not follow AiWA's naming conventions. Please rename it to match `aiwa/feature-name` or `aiwa/type/feature-name` (e.g., `aiwa/feat/add-login`).",
  commitMessagePattern: "^(feat|fix|docs|style|refactor|perf|test|chore)(\\([a-zA-Z0-9\\-]+\\))?: .{1,100}", // Conventional Commits
  commitMessagePatternMessage: "⚠️ Commit message `%COMMIT_MESSAGE%` (SHA: `%COMMIT_SHA%`) does not follow Conventional Commits format (e.g., `feat: add new login button`). See https://www.conventionalcommits.org/",
  prTitleMinLength: 10,
  prTitleMinLengthMessage: "⚠️ Pull Request title is too short. Please provide a more descriptive title (min %MIN_LENGTH% characters).",
  prBodyMinLength: 20,
  prBodyMinLengthMessage: "⚠️ Pull Request body is too short. Please provide a more detailed description of the changes (min %MIN_LENGTH% characters). Consider using a PR template.",
  ensureFiles: { // Files to ensure exist in new repositories
    "SECURITY.md": "Please refer to our security policy at [link-to-your-org-security-policy].\n\n## Reporting a Vulnerability\n\nPlease report suspected security vulnerabilities to `security@example.com` privately. Please do NOT create a public GitHub issue.",
    "CODE_OF_CONDUCT.md": "# Contributor Covenant Code of Conduct\n\n(Content from https://www.contributor-covenant.org/version/2/1/code_of_conduct/code_of_conduct.md or your own CoC)",
    // "dependabot.yml": "# Basic Dependabot config - customize as needed\nversion: 2\nupdates:\n  - package-ecosystem: \"npm\"\n    directory: \"/\"\n    schedule:\n      interval: \"daily\"\n  - package-ecosystem: \"github-actions\"\n    directory: \"/\"\n    schedule:\n      interval: \"daily\""
  },
  newRepoIssueTitle: "🚀 New Repository Setup Checklist",
  newRepoIssueBody: `Welcome to your new repository! Please complete the following setup tasks:
  - [ ] Configure branch protection rules.
  - [ ] Add relevant repository topics/tags.
  - [ ] Review and customize \`SECURITY.md\`.
  - [ ] Review and customize \`CODE_OF_CONDUCT.md\`.
  - [ ] Setup Dependabot if not already present (\`.github/dependabot.yml\`).
  - [ ] Add a comprehensive \`README.md\`.
  - [ ] Consider adding issue and PR templates (\`.github/\`).`
};

module.exports = (app) => {
  app.log.info("🤖 AiWA ComplianceBot is running");

  // Helper to get config
  async function getConfig(context) {
    return await context.config("aiwa-compliance.yml", defaultConfig);
  }

  // --- Installation Event ---
  app.on("installation", async (context) => {
    const { account } = context.payload;
    context.log.info(`App installed by ${account.login} on ${context.payload.installation.target_type} ${account.login}`);
    // You could create a welcome issue on each new repository if 'repositories_added' is part of the payload
  });

  app.on("installation_repositories.added", async (context) => {
    context.log.info(`App installed on new repositories for ${context.payload.installation.account.login}`);
    const config = await getConfig(context); // Get config for potentially creating issues
    // Loop through context.payload.repositories_added to take action on each new repo
    for (const repo of context.payload.repositories_added) {
      context.log.info(`New repo added to installation: ${repo.full_name}`);
      // Optionally, create a setup issue here too, similar to repository.created
      // This is useful if the app is installed on an org, and then new repos are selected
      try {
        await context.octokit.issues.create(
          context.repo({
            owner: repo.full_name.split('/')[0], // extract owner
            repo: repo.name, // extract repo name
            title: config.newRepoIssueTitle,
            body: config.newRepoIssueBody
          })
        );
        context.log.info(`Created setup checklist issue in ${repo.full_name}`);
      } catch (error) {
        context.log.error(`Failed to create setup issue in ${repo.full_name}:`, error);
      }
    }
  });


  // --- Pull Request Events ---
  const prEvents = ["pull_request.opened", "pull_request.reopened", "pull_request.synchronize", "pull_request.edited"];
  app.on(prEvents, async (context) => {
    const pr = context.payload.pull_request;
    const repo = context.payload.repository;
    const config = await getConfig(context);

    // 1. Branch Naming Compliance
    const branchName = pr.head.ref;
    const branchPattern = new RegExp(config.branchPattern);
    if (!branchPattern.test(branchName)) {
      const message = config.branchPatternMessage.replace("%BRANCH_NAME%", branchName);
      try {
        await context.octokit.issues.createComment(context.issue({ body: message }));
        context.log.warn(`Branch naming violation in ${repo.full_name}#${pr.number}: ${branchName}`);
      } catch (error) {
        context.log.error(`Failed to comment on branch naming violation:`, error);
      }
    }

    // 2. Commit Message Compliance (on opened and synchronize)
    if (["pull_request.opened", "pull_request.synchronize"].includes(context.name)) {
      const commitMessagePattern = new RegExp(config.commitMessagePattern);
      let nonCompliantCommits = [];

      try {
        const { data: commits } = await context.octokit.pulls.listCommits(
          context.pullRequest({ per_page: 100 }) // Max 100 commits, pagination needed for more
        );

        for (const item of commits) {
          const commitMessage = item.commit.message.split('\n')[0]; // Check only the first line
          if (!commitMessagePattern.test(commitMessage)) {
            nonCompliantCommits.push({ sha: item.sha.substring(0, 7), message: commitMessage });
          }
        }

        if (nonCompliantCommits.length > 0) {
          let commentBody = "⚠️ Some commit messages do not follow AiWA's conventions:\n\n";
          nonCompliantCommits.forEach(commit => {
            commentBody += `- ${config.commitMessagePatternMessage
              .replace("%COMMIT_MESSAGE%", commit.message)
              .replace("%COMMIT_SHA%", commit.sha)}\n`;
          });
          commentBody += "\nPlease rebase and squash/fixup these commits.";

          await context.octokit.issues.createComment(context.issue({ body: commentBody }));
          context.log.warn(`Commit message violations in ${repo.full_name}#${pr.number}`);
        }
      } catch (error) {
        context.log.error(`Failed to check commit messages:`, error);
      }
    }

    // 3. PR Title Length (on opened and edited)
    if (["pull_request.opened", "pull_request.edited"].includes(context.name)) {
      if (pr.title.length < config.prTitleMinLength) {
        const message = config.prTitleMinLengthMessage.replace("%MIN_LENGTH%", config.prTitleMinLength);
        try {
          // Check if a similar comment already exists to avoid spamming
          const { data: comments } = await context.octokit.issues.listComments(context.issue());
          const botComment = comments.find(comment => comment.user.login === "aiwa-compliancebot[bot]" && comment.body.includes("Pull Request title is too short")); // Adjust bot name if needed

          if (!botComment || context.name === 'pull_request.edited') { // Post if no comment or if PR was edited
             await context.octokit.issues.createComment(context.issue({ body: message }));
          }
          context.log.warn(`PR title too short in ${repo.full_name}#${pr.number}`);
        } catch (error) {
          context.log.error(`Failed to comment on short PR title:`, error);
        }
      }
    }

    // 4. PR Body Length (on opened and edited)
    if (["pull_request.opened", "pull_request.edited"].includes(context.name)) {
      // Ensure body is not null or undefined before checking length
      const prBody = pr.body || "";
      if (prBody.length < config.prBodyMinLength) {
        const message = config.prBodyMinLengthMessage.replace("%MIN_LENGTH%", config.prBodyMinLength);
        try {
           // Check if a similar comment already exists
           const { data: comments } = await context.octokit.issues.listComments(context.issue());
           const botComment = comments.find(comment => comment.user.login === "aiwa-compliancebot[bot]" && comment.body.includes("Pull Request body is too short"));

           if (!botComment || context.name === 'pull_request.edited') {
             await context.octokit.issues.createComment(context.issue({ body: message }));
           }
          context.log.warn(`PR body too short in ${repo.full_name}#${pr.number}`);
        } catch (error) {
          context.log.error(`Failed to comment on short PR body:`, error);
        }
      }
    }
  });

  // --- Repository Events ---
  app.on("repository.created", async (context) => {
    const repo = context.payload.repository;
    const owner = repo.owner.login;
    const repoName = repo.name;
    context.log.info(`Repository created: ${repo.full_name}`);
    const config = await getConfig(context);

    // 1. Ensure standard files (SECURITY.md, CODE_OF_CONDUCT.md, etc.)
    if (config.ensureFiles && Object.keys(config.ensureFiles).length > 0) {
      for (const [filePath, content] of Object.entries(config.ensureFiles)) {
        try {
          // Check if file exists
          try {
            await context.octokit.repos.getContent(context.repo({ path: filePath }));
            context.log.info(`File ${filePath} already exists in ${repo.full_name}.`);
          } catch (error) { // Octokit throws 404 if not found
            if (error.status === 404) {
              await context.octokit.repos.createOrUpdateFileContents(
                context.repo({
                  path: filePath,
                  message: `docs: Add initial ${filePath}`,
                  content: Buffer.from(content).toString("base64"),
                  committer: {
                    name: "AiWA ComplianceBot",
                    email: "bot@aiwa.example.com", // Replace with a valid bot email if needed
                  },
                  author: {
                    name: "AiWA ComplianceBot",
                    email: "bot@aiwa.example.com",
                  },
                })
              );
              context.log.info(`Created ${filePath} in ${repo.full_name}`);
            } else {
              throw error; // Re-throw other errors
            }
          }
        } catch (error) {
          context.log.error(`Failed to ensure/create file ${filePath} in ${repo.full_name}:`, error);
        }
      }
    }

    // 2. Create a "Setup Checklist" issue
    try {
      await context.octokit.issues.create(
        context.repo({
          title: config.newRepoIssueTitle,
          body: config.newRepoIssueBody
        })
      );
      context.log.info(`Created setup checklist issue in ${repo.full_name}`);
    } catch (error) {
      context.log.error(`Failed to create setup issue in ${repo.full_name}:`, error);
    }

    // TODO: Validate presence of dependabot.yml (more complex as it requires content)
    // For dependabot.yml, you might just create an issue recommending its setup or
    // attempt to create a basic one if `config.ensureFiles["dependabot.yml"]` is defined.
  });

  // --- Error Handling for Uncaught Errors ---
  app.onError(async (error) => {
    app.log.error("An uncaught error occurred in the Probot app:");
    app.log.error(error);
    // Potentially notify an administrator or a monitoring service
  });
};
