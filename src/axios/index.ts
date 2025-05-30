import { AxiosHttpAdapter } from "./axios";

/**
 * @description HTTP client module for REST API interactions
 * @summary This module provides classes and utilities for interacting with REST APIs.
 * It exposes repository and service classes for making HTTP requests, along with
 * type definitions and adapters for different HTTP clients. The module includes
 * {@link RestRepository} and {@link RestService} for API interactions.
 * @namespace axios
 * @memberOf module:for-http
 */

AxiosHttpAdapter.decoration();

export * from "./axios";
export * from "./constants";
export * from "./types";
