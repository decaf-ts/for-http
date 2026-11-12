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
  /**
   * Create with the primary key in the URL (`POST /<table>/<pk...>`) instead of the REST
   * default `POST /<table>`. Must match the HttpAdapter client's `idInUrl`. Updates always
   * carry the pk in the URL. Whenever the URL carries the pk, it must match the payload's.
   */
  idInUrl?: boolean;
  allowStatementlessQuery?: boolean;
  allowGroupingQueries?: boolean | GroupingQueryFlags;
  allowBulkStatement?: boolean | BulkStatementFlags;
  auth?: AuthConfig;
}
