import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { GitHubManager } from "./components/github-manager";
import { AwsIdentityCenterManager } from "./components/aws-identity-center-manager";
import { loadUsersConfig } from "./utils/config-loader";

const config = new pulumi.Config();
const githubOrg = config.require("githubOrg");
const awsAccountId = config.require("awsAccountId");

const usersConfig = loadUsersConfig();

// Look up the SSO instance provisioned in this account
const ssoInstance = aws.ssoadmin.getInstances();
const identityStoreId = ssoInstance.then((i) => i.identityStoreIds[0]);
const ssoInstanceArn = ssoInstance.then((i) => i.arns[0]);

const githubManager = new GitHubManager("org", {
  organization: githubOrg,
  users: usersConfig.users,
});

const awsIdentityManager = new AwsIdentityCenterManager("sso", {
  identityStoreId,
  ssoInstanceArn,
  users: usersConfig.users,
  awsAccountId,
});

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
