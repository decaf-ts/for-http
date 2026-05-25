import "@decaf-ts/core";
import { Metadata } from "@decaf-ts/decoration";

/**
 * @description HTTP client module for REST API interactions
 * @summary This module provides classes and utilities for interacting with REST APIs.
 * It exposes repository and service classes for making HTTP requests, along with
 * type definitions and adapters for different HTTP clients. The module includes
 * {@link RestRepository} and {@link RestService} for API interactions.
 * @module for-http
 */
export * from "./axios";
export * from "./adapter";
export * from "./constants";
export * from "./HttpPaginator";
export * from "./HttpStatement";
export * from "./RestRepository";
export * from "./RestService";
export * from "./types";
export * from "./event";

/**
 * @description Current version of the for-http module
 * @summary Version identifier for the module
 * @const VERSION
 */
export const VERSION = "##VERSION##";

/**
 * @description Represents the current commit hash of the module build.
 * @summary Stores the current git commit hash for the package. The build replaces
 * the placeholder with the actual commit hash at publish time.
 * @const COMMIT
 */
export const COMMIT = "##COMMIT##";

/**
 * @description Represents the full version string of the module.
 * @summary Stores the semver version and commit hash for the package.
 * The build replaces the placeholder with the actual `<version>-<commit>` value at publish time.
 * @const FULL_VERSION
 */
export const FULL_VERSION = "##FULL_VERSION##";


export const PACKAGE_NAME = "##PACKAGE##";

Metadata.registerLibrary(PACKAGE_NAME, VERSION);
