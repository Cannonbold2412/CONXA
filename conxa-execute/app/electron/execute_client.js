"use strict";
/**
 * Thin fetch wrapper for conxa-execute's backend (Top-up/Subscription modes
 * only — BYOK never talks to this). Base URL comes from
 * CONXA_EXECUTE_API_BASE_URL, same default-empty-until-configured pattern as
 * auth_service.js's Clerk settings.
 */
const authService = require("./auth_service");

function baseUrl() {
  return (process.env.CONXA_EXECUTE_API_BASE_URL || "").replace(/\/+$/, "");
}

async function request(path, options = {}) {
  const token = await authService.getToken();
  const resp = await fetch(`${baseUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const text = await resp.text();
  const data = text ? JSON.parse(text) : null;
  if (!resp.ok) {
    throw new Error((data && (data.detail || data.error)) || `execute_api_http_${resp.status}`);
  }
  return data;
}

function getEntitlement() {
  return request("/v1/entitlement");
}

function listSessions() {
  return request("/v1/sessions");
}

function getSession(id) {
  return request(`/v1/sessions/${id}`);
}

function createSession() {
  return request("/v1/sessions", { method: "POST" });
}

function updateSession(id, messages, title) {
  return request(`/v1/sessions/${id}`, {
    method: "PUT",
    body: JSON.stringify({ messages, title }),
  });
}

function deleteSession(id) {
  return request(`/v1/sessions/${id}`, { method: "DELETE" });
}

module.exports = { getEntitlement, listSessions, getSession, createSession, updateSession, deleteSession, baseUrl };
