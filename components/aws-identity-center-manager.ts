import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { UserConfig } from "../types";

export interface AwsIdentityCenterManagerArgs {
  identityStoreId: pulumi.Input<string>;
  ssoInstanceArn: pulumi.Input<string>;
  users: UserConfig[];
  awsAccountId: string;
}

/**
 * Permission-set definitions per environment.
 * "dev" grants broader access for development work; "prod" is read-only
 * to enforce least-privilege in production.
 */
const PERMISSION_SET_CONFIGS: Record<
  string,
  { description: string; policies: string[]; sessionDuration: string }
> = {
  dev: {
    description: "Developer access - broader permissions for the dev environment",
    policies: [
      "arn:aws:iam::aws:policy/PowerUserAccess",
    ],
    sessionDuration: "PT8H",
  },
  prod: {
    description: "Read-only access - least-privilege for the prod environment",
    policies: [
      "arn:aws:iam::aws:policy/ReadOnlyAccess",
    ],
    sessionDuration: "PT4H",
  },
};

/**
 * Manages AWS IAM Identity Center (SSO) users, groups, permission sets,
 * and account assignments.
 *
 * Groups are derived from the unique `aws_account` values in the user config
 * (e.g. "dev", "prod"). Each group gets a permission set attached with
 * least-privilege managed policies and is assigned to the target AWS account.
 */
export class AwsIdentityCenterManager extends pulumi.ComponentResource {
  public readonly ssoUsers: Record<string, aws.identitystore.User>;
  public readonly groups: Record<string, aws.identitystore.Group>;
  public readonly groupMemberships: aws.identitystore.GroupMembership[];
  public readonly permissionSets: Record<string, aws.ssoadmin.PermissionSet>;

  constructor(
    name: string,
    args: AwsIdentityCenterManagerArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("infra:aws:IdentityCenterManager", name, {}, opts);

    const { identityStoreId, ssoInstanceArn, users, awsAccountId } = args;
    const groupNames = [...new Set(users.map((u) => u.aws_account))];

    // --- Groups ---
    this.groups = {};
    for (const groupName of groupNames) {
      this.groups[groupName] = new aws.identitystore.Group(
        `${name}-group-${groupName}`,
        {
          identityStoreId,
          displayName: `${groupName}-team`,
          description: `${groupName} environment access group - managed by Pulumi`,
        },
        { parent: this }
      );
    }

    // --- SSO Users ---
    this.ssoUsers = {};
    for (const user of users) {
      const email = user.email || `${user.name}@example.com`;
      this.ssoUsers[user.name] = new aws.identitystore.User(
        `${name}-user-${user.name}`,
        {
          identityStoreId,
          displayName: user.name,
          userName: user.name,
          name: {
            givenName: user.name.charAt(0).toUpperCase() + user.name.slice(1),
            familyName: "User",
          },
          emails: {
            value: email,
            primary: true,
          },
        },
        { parent: this }
      );
    }

    // --- Group Memberships ---
    this.groupMemberships = [];
    for (const user of users) {
      const membership = new aws.identitystore.GroupMembership(
        `${name}-gm-${user.name}`,
        {
          identityStoreId,
          groupId: this.groups[user.aws_account].groupId,
          memberId: this.ssoUsers[user.name].userId,
        },
        { parent: this }
      );
      this.groupMemberships.push(membership);
    }

    // --- Permission Sets & Account Assignments ---
    this.permissionSets = {};
    for (const groupName of groupNames) {
      const psConfig =
        PERMISSION_SET_CONFIGS[groupName] || PERMISSION_SET_CONFIGS.dev;

      const permissionSet = new aws.ssoadmin.PermissionSet(
        `${name}-ps-${groupName}`,
        {
          name: `${groupName}-access`,
          description: psConfig.description,
          instanceArn: ssoInstanceArn,
          sessionDuration: psConfig.sessionDuration,
        },
        { parent: this }
      );
      this.permissionSets[groupName] = permissionSet;

      for (let i = 0; i < psConfig.policies.length; i++) {
        new aws.ssoadmin.ManagedPolicyAttachment(
          `${name}-mpa-${groupName}-${i}`,
          {
            instanceArn: ssoInstanceArn,
            managedPolicyArn: psConfig.policies[i],
            permissionSetArn: permissionSet.arn,
          },
          { parent: this }
        );
      }

      new aws.ssoadmin.AccountAssignment(
        `${name}-aa-${groupName}`,
        {
          instanceArn: ssoInstanceArn,
          permissionSetArn: permissionSet.arn,
          principalId: this.groups[groupName].groupId,
          principalType: "GROUP",
          targetId: awsAccountId,
          targetType: "AWS_ACCOUNT",
        },
        { parent: this }
      );
    }

    this.registerOutputs({
      groupNames,
    });
  }
}
