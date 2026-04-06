import * as pulumi from "@pulumi/pulumi";
import * as github from "@pulumi/github";
import { UserConfig } from "../types";

export interface GitHubManagerArgs {
  organization: string;
  users: UserConfig[];
}

/** Creates GitHub org teams and memberships from the shared user config. */
export class GitHubManager extends pulumi.ComponentResource {
  public readonly teams: Record<string, github.Team>;
  public readonly memberships: github.Membership[];
  public readonly teamMemberships: github.TeamMembership[];

  constructor(
    name: string,
    args: GitHubManagerArgs,
    opts?: pulumi.ComponentResourceOptions
  ) {
    super("infra:github:GitHubManager", name, {}, opts);

    const { users } = args;
    const teamNames = [...new Set(users.map((u) => u.github_team))];

    this.teams = {};
    for (const teamName of teamNames) {
      this.teams[teamName] = new github.Team(
        `${name}-team-${teamName}`,
        {
          name: teamName,
          description: `${teamName} team - managed by Pulumi`,
          privacy: "closed",
        },
        { parent: this }
      );
    }

    this.memberships = [];
    this.teamMemberships = [];

    for (const user of users) {
      const membership = new github.Membership(
        `${name}-member-${user.name}`,
        {
          username: user.name,
          role: "member",
        },
        { parent: this }
      );
      this.memberships.push(membership);

      const teamMembership = new github.TeamMembership(
        `${name}-team-member-${user.name}`,
        {
          teamId: this.teams[user.github_team].id,
          username: user.name,
          role: "member",
        },
        { parent: this, dependsOn: [membership] }
      );
      this.teamMemberships.push(teamMembership);
    }

    this.registerOutputs({
      teamNames: teamNames,
    });
  }
}
