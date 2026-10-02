export interface PersonRecord {
  uid: string
  cn: string
  displayName: string
  preferredLastName: string
  jobTitle: string
  jobRole: string
  geo: string
  co: string
  l: string
  location: string
  hireDate: string
  workerId: string
  costCenter: string
  costCenterDesc: string
  managerUid: string | null
  directReports: number
  totalReports: number
  teamId: string | null
  yamlRoles: string[]
  tags: string[]
}

export interface TeamRecord {
  id: string
  name: string
  tabName: string
  type: 'org' | 'team_group' | 'team'
  parentTeamId: string | null
  managerUid: string | null
  description: string
}

export interface BaselineData {
  importedAt: string
  rootUid: string
  people: Record<string, PersonRecord>
  teams: Record<string, TeamRecord>
}
