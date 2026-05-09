/** @format */

declare global {
  interface Window {
    __PROCOLLAB_CONFIG__?: {
      apiUrl?: string;
      skillsApiUrl?: string;
      websocketUrl?: string;
      sentryDns?: string;
    };
  }
}

const runtimeConfig =
  typeof window !== "undefined" ? window.__PROCOLLAB_CONFIG__ || {} : {};

const normalizeUrl = (value: string): string => value.replace(/\/$/, "");

const defaultApiUrl = normalizeUrl(runtimeConfig.apiUrl || "/api");
const defaultWebsocketUrl = (): string => {
  if (runtimeConfig.websocketUrl) {
    return normalizeUrl(runtimeConfig.websocketUrl);
  }

  if (defaultApiUrl.startsWith("http://")) {
    return defaultApiUrl.replace(/^http:\/\//, "ws://") + "/ws";
  }

  if (defaultApiUrl.startsWith("https://")) {
    return defaultApiUrl.replace(/^https:\/\//, "wss://") + "/ws";
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
};

export const environment = {
  production: true,
  sentryDns: runtimeConfig.sentryDns || "",
  apiUrl: defaultApiUrl,
  skillsApiUrl: normalizeUrl(runtimeConfig.skillsApiUrl || "/skills-api"),
  // websockets
  websocketUrl: defaultWebsocketUrl(),
  websocketReconnectionInterval: 5000,
  websocketReconnectionMaxAttempts: 5,
};

export {};
