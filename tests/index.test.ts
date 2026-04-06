import * as pulumi from "@pulumi/pulumi";

// Must be set before any Pulumi resource is imported so the runtime enters
// test mode and never tries to talk to a real backend.
pulumi.runtime.setMocks(
  {
    newResource(args: pulumi.runtime.MockResourceArgs): {
      id: string;
      state: Record<string, unknown>;
    } {
      return {
        id: `${args.name}-id`,
        state: {
          ...args.inputs,
          // Synthesise outputs that components read from child resources
          groupId: `${args.name}-groupId`,
          userId: `${args.name}-userId`,
          arn: `arn:aws:sso:::permissionSet/ssoins-mock/${args.name}`,
        },
      };
    },
    call(args: pulumi.runtime.MockCallArgs): Record<string, unknown> {
      if (args.token === "aws:ssoadmin/getInstances:getInstances") {
        return {
          arns: ["arn:aws:sso:::instance/ssoins-mock"],
          identityStoreIds: ["d-mock123456"],
        };
      }
      return args.inputs;
    },
  },
  "infra-user-management",
  "dev"
);

// --- Now safe to import resource modules ---------------------------------
import { describe, it } from "mocha";
import * as assert from "assert";
import * as path from "path";

import { loadUsersConfig } from "../utils/config-loader";

describe("Config loader", () => {
  it("loads and validates the default users.yaml", () => {
    const cfg = loadUsersConfig(
      path.join(__dirname, "..", "config", "users.yaml")
    );
    assert.ok(Array.isArray(cfg.users));
    assert.ok(cfg.users.length >= 2, "should contain at least 2 users");
  });

  it("every user has required fields", () => {
    const cfg = loadUsersConfig(
      path.join(__dirname, "..", "config", "users.yaml")
    );
    for (const u of cfg.users) {
      assert.ok(u.name, "name is required");
      assert.ok(u.github_team, "github_team is required");
      assert.ok(u.aws_account, "aws_account is required");
    }
  });

  it("rejects a config file missing the users array", () => {
    const bad = path.join(__dirname, "fixtures", "bad-config.yaml");
    const fs = require("fs");
    const dir = path.dirname(bad);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(bad, "not_users:\n  - foo\n");

    assert.throws(() => loadUsersConfig(bad), /users/);

    fs.unlinkSync(bad);
    fs.rmdirSync(dir);
  });
});

describe("GitHubManager component", () => {
  it("creates the expected teams from user config", async () => {
    const { GitHubManager } = await import("../components/github-manager");
    const users = [
      { name: "alice", github_team: "backend", aws_account: "dev" },
      { name: "bob", github_team: "frontend", aws_account: "prod" },
    ];

    const mgr = new GitHubManager("test-gh", {
      organization: "test-org",
      users,
    });

    assert.ok(mgr.teams["backend"], "backend team should exist");
    assert.ok(mgr.teams["frontend"], "frontend team should exist");
    assert.strictEqual(Object.keys(mgr.teams).length, 2);
  });

  it("creates one membership per user", async () => {
    const { GitHubManager } = await import("../components/github-manager");
    const users = [
      { name: "alice", github_team: "backend", aws_account: "dev" },
      { name: "bob", github_team: "frontend", aws_account: "prod" },
      { name: "charlie", github_team: "backend", aws_account: "dev" },
    ];

    const mgr = new GitHubManager("test-gh2", {
      organization: "test-org",
      users,
    });

    assert.strictEqual(mgr.memberships.length, 3);
    assert.strictEqual(mgr.teamMemberships.length, 3);
  });
});

describe("AwsIdentityCenterManager component", () => {
  it("creates groups for each unique aws_account value", async () => {
    const { AwsIdentityCenterManager } = await import(
      "../components/aws-identity-center-manager"
    );
    const users = [
      { name: "alice", github_team: "backend", aws_account: "dev" },
      { name: "bob", github_team: "frontend", aws_account: "prod" },
    ];

    const mgr = new AwsIdentityCenterManager("test-aws", {
      identityStoreId: "d-mock",
      ssoInstanceArn: "arn:aws:sso:::instance/ssoins-mock",
      users,
      awsAccountId: "123456789012",
    });

    assert.ok(mgr.groups["dev"], "dev group should exist");
    assert.ok(mgr.groups["prod"], "prod group should exist");
    assert.strictEqual(Object.keys(mgr.groups).length, 2);
  });

  it("creates one SSO user per config entry", async () => {
    const { AwsIdentityCenterManager } = await import(
      "../components/aws-identity-center-manager"
    );
    const users = [
      { name: "alice", github_team: "backend", aws_account: "dev" },
      { name: "bob", github_team: "frontend", aws_account: "prod" },
      { name: "charlie", github_team: "backend", aws_account: "dev" },
    ];

    const mgr = new AwsIdentityCenterManager("test-aws2", {
      identityStoreId: "d-mock",
      ssoInstanceArn: "arn:aws:sso:::instance/ssoins-mock",
      users,
      awsAccountId: "123456789012",
    });

    assert.strictEqual(Object.keys(mgr.ssoUsers).length, 3);
    assert.strictEqual(mgr.groupMemberships.length, 3);
  });

  it("creates a permission set per group", async () => {
    const { AwsIdentityCenterManager } = await import(
      "../components/aws-identity-center-manager"
    );
    const users = [
      { name: "alice", github_team: "backend", aws_account: "dev" },
      { name: "bob", github_team: "frontend", aws_account: "prod" },
    ];

    const mgr = new AwsIdentityCenterManager("test-aws3", {
      identityStoreId: "d-mock",
      ssoInstanceArn: "arn:aws:sso:::instance/ssoins-mock",
      users,
      awsAccountId: "123456789012",
    });

    assert.ok(mgr.permissionSets["dev"], "dev permission set should exist");
    assert.ok(mgr.permissionSets["prod"], "prod permission set should exist");
  });
});
