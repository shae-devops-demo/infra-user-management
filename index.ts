import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { GitHubManager } from "./components/github-manager";
import { AwsIdentityCenterManager } from "./components/aws-identity-center-manager";
import { loadUsersConfig } from "./utils/config-loader";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const config = new pulumi.Config();
const githubOrg = config.require("githubOrg");
const awsAccountId = config.require("awsAccountId");

// ---------------------------------------------------------------------------
// Load users from the single config file
// ---------------------------------------------------------------------------

const usersConfig = loadUsersConfig();

// ---------------------------------------------------------------------------
// AWS SSO instance lookup
// ---------------------------------------------------------------------------

const ssoInstance = aws.ssoadmin.getInstances();
const identityStoreId = ssoInstance.then((i) => i.identityStoreIds[0]);
const ssoInstanceArn = ssoInstance.then((i) => i.arns[0]);

// ---------------------------------------------------------------------------
// GitHub — teams & memberships
// ---------------------------------------------------------------------------

const githubManager = new GitHubManager("org", {
  organization: githubOrg,
  users: usersConfig.users,
});

// ---------------------------------------------------------------------------
// AWS Identity Center — users, groups, permission sets
// ---------------------------------------------------------------------------

const awsIdentityManager = new AwsIdentityCenterManager("sso", {
  identityStoreId,
  ssoInstanceArn,
  users: usersConfig.users,
  awsAccountId,
});

// ---------------------------------------------------------------------------
// Stack exports
// ---------------------------------------------------------------------------

export const githubTeams = Object.fromEntries(
  Object.entries(githubManager.teams).map(([k, v]) => [k, v.id])
);

export const awsSsoGroups = Object.fromEntries(
  Object.entries(awsIdentityManager.groups).map(([k, v]) => [k, v.groupId])
);

export const awsSsoUsers = Object.fromEntries(
  Object.entries(awsIdentityManager.ssoUsers).map(([k, v]) => [k, v.userId])
);

export const awsPermissionSets = Object.fromEntries(
  Object.entries(awsIdentityManager.permissionSets).map(([k, v]) => [k, v.arn])
);
