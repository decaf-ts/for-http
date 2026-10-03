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

export interface AuthConfig {
  public?: boolean;
  roles?: string[];
  namespaces?: string[];
  skipModelRoles?: boolean;
  skipModelNamespaces?: boolean;
}

export interface ModelControllerFactoryConfig {
  allowStatementlessQuery?: boolean;
  allowGroupingQueries?: boolean | GroupingQueryFlags;
  allowBulkStatement?: boolean | BulkStatementFlags;
  auth?: AuthConfig;
  /**
   * When set, the generated from-model CRUD is scoped to the authenticated
   * principal recorded in the named column. Creates set the column from the
   * request's authenticated user; reads/updates/deletes assert ownership; list
   * routes filter to the caller's own rows. Legacy rows without an owner remain
   * viewable/operable by any authenticated caller.
   */
  ownerScopedField?: string;
}
