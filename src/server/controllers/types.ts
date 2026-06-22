export type GroupingQueryFlags = {
  count?: boolean;
  avg?: boolean;
  max?: boolean;
  min?: boolean;
  sum?: boolean;
  distinct?: boolean;
  group?: boolean;
};

export type BulkStatementFlags = {
  create?: boolean;
  read?: boolean;
  update?: boolean;
  delete?: boolean;
};

export interface ModelControllerFactoryConfig {
  allowStatementlessQuery?: boolean;
  allowGroupingQueries?: boolean | GroupingQueryFlags;
  allowBulkStatement?: boolean | BulkStatementFlags;
}
