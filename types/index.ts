export interface UserConfig {
  name: string;
  email?: string;
  github_team: string;
  aws_account: string;
}

export interface UsersConfig {
  users: UserConfig[];
}
