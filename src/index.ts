import "@decaf-ts/core";

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
export * from "./RestRepository";
export * from "./RestService";
export * from "./types";

/**
 * @description Current version of the for-http module
 * @summary Version identifier for the module
 * @const VERSION
 */
export const VERSION = "##VERSION##";
