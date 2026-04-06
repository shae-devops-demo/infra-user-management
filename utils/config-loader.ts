import * as fs from "fs";
import * as yaml from "js-yaml";
import * as path from "path";
import { UsersConfig, UserConfig } from "../types";

function validateUser(user: unknown, index: number): UserConfig {
  const u = user as Record<string, unknown>;

  if (!u.name || typeof u.name !== "string") {
    throw new Error(`User at index ${index}: 'name' is required and must be a string`);
  }
  if (!u.github_team || typeof u.github_team !== "string") {
    throw new Error(`User '${u.name}': 'github_team' is required and must be a string`);
  }
  if (!u.aws_account || typeof u.aws_account !== "string") {
    throw new Error(`User '${u.name}': 'aws_account' is required and must be a string`);
  }

  return {
    name: u.name,
    email: typeof u.email === "string" ? u.email : undefined,
    github_team: u.github_team,
    aws_account: u.aws_account,
  };
}

export function loadUsersConfig(configPath?: string): UsersConfig {
  const filePath =
    configPath || path.join(__dirname, "..", "config", "users.yaml");
  const fileContents = fs.readFileSync(filePath, "utf8");
  const raw = yaml.load(fileContents) as Record<string, unknown>;

  if (!raw || !Array.isArray(raw.users)) {
    throw new Error(
      "Invalid config: file must contain a 'users' array at the top level"
    );
  }

  const users = raw.users.map((u: unknown, i: number) => validateUser(u, i));

  return { users };
}
