/** @format */

declare global {
  interface Window {
    __PROCOLLAB_CONFIG__?: {
      apiUrl?: string;
      skillsApiUrl?: string;
    };
  }
}

const runtimeConfig =
  typeof window !== "undefined" ? window.__PROCOLLAB_CONFIG__ || {} : {};

const normalizeUrl = (value: string): string => value.replace(/\/$/, "");

export const environment = {
  production: true,
  apiUrl: normalizeUrl(runtimeConfig.apiUrl || "/api"),
  skillsApiUrl: normalizeUrl(runtimeConfig.skillsApiUrl || "/skills-api"),
};

export {};
