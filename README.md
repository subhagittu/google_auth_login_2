# TaskFlow - Login Page Documentation

This document explains in detail how the `login.html` page works, its underlying logic, the UI/UX features, and how it interacts with the backend authentication API.

## Overview

The login page (`login.html`) serves as the gateway to the TaskFlow application. It's a Single-Page Application (SPA) style form that dynamically switches between multiple authentication modes without reloading the page. It manages sign-in, registration (with OTP verification), password recovery, and Google OAuth integration.

## Key Features & UI/UX

1.  **Dynamic Device Redirection:**
    A script at the top of the `<head>` checks the user's viewport dimensions (`window.innerWidth` and `window.innerHeight`). Depending on the device type, it seamlessly redirects the user to device-optimized versions:
    *   `login_phone.html` (Mobile)
    *   `login_tablet.html` (Tablet)
    *   `login.html` (Laptop / Desktop)

2.  **Theme System (Light/Dark Mode):**
    *   Uses CSS variables (`--bg`, `--text`, etc.) tied to `data-theme` attributes on the `<html>` tag.
    *   A toggle button allows switching between light and dark themes.
    *   The preference is saved in the browser's `localStorage` as `taskflow-theme`.

3.  **Modern Aesthetics:**
    *   **Glassmorphism:** The login card uses `backdrop-filter: blur(20px)` and semi-transparent backgrounds to create a frosted glass effect.
    *   **Animated Backgrounds:** CSS keyframes (`@keyframes orb-float`) animate floating, blurred orbs in the background.

## Authentication Modes

The page uses a single `<form id="auth-form">` but changes its display based on the `mode` variable. The `switchMode(m)` function handles toggling the visibility of fields and modifying button labels.

The available modes are:

*   **`login`:** (Default) Requires Username and Password.
*   **`register`:** Prompts for Display Name, Email, Username, and Password. Upon submission, triggers OTP generation.
*   **`verify-otp`:** After registration, displays 6 separate input boxes for the user to enter the OTP sent to their email.
*   **`forgot-password`:** Asks for the user's email address to send a password reset OTP.
*   **`forgot-password-verify`:** Prompts for the OTP sent for password reset.
*   **`forgot-password-reset`:** Asks the user to enter and re-type their new password.
*   **`complete`:** If a user signs in via Google for the first time, they are prompted to create a unique Username and Password to complete their profile setup.

## OTP Input Handling

The OTP verification UI utilizes a seamless approach:
*   6 individual `<input maxlength="1">` elements.
*   Events like `oninput`, `onkeydown`, and `onpaste` are wired to JavaScript functions (`moveToNext`, `handleKeyDown`, `handlePaste`) that auto-advance the focus when a number is typed, or handle pasting a full 6-digit code.

## Backend API Integration

The frontend communicates with a Node.js/Express backend running on port `3001` (by default). The API requests include `credentials: 'include'` to support session cookies.

Here are the primary endpoints interacted with:

1.  **Session Check (`GET /api/auth/me`)**
    *   Called immediately upon page load. If the user is already authenticated (has a valid session cookie), they are instantly redirected to `index.html`.
2.  **Login (`POST /api/auth/login`)**
    *   Payload: `{ username, password }`
    *   On success, redirects to `index.html`.
3.  **Register - Send OTP (`POST /api/auth/send-otp`)**
    *   Payload: `{ username, email, password }`
    *   Verifies availability and emails an OTP. UI switches to `verify-otp`.
4.  **Register - Verify & Create (`POST /api/auth/register`)**
    *   Payload: `{ username, email, password, displayName, otp }`
    *   Validates the OTP and creates the account.
5.  **Google Auth (`POST /api/auth/google`)**
    *   Triggered when the Google identity client returns a token.
    *   Payload: `{ token, mode }`
    *   If the Google account doesn't have a linked TaskFlow username/password, the server responds with `{ requiresCompletion: true }` prompting the UI to switch to `complete` mode.
6.  **Google Complete (`POST /api/auth/google/complete`)**
    *   Payload: `{ username, password }`
    *   Finalizes the profile for new Google Sign-in users.
7.  **Password Reset Flow**
    *   `POST /api/auth/forgot-password-otp`: Sends reset code.
    *   `POST /api/auth/verify-reset-otp`: Validates code.
    *   `POST /api/auth/reset-password`: Sets the new password.

## Google Sign-In Integration

*   The Google Identity API script (`https://accounts.google.com/gsi/client`) is loaded asynchronously.
*   The script uses a `GOOGLE_CLIENT_ID` fetched dynamically from `/api/config`.
*   A custom button is rendered in `#google-btn` which visually adapts to the active dark/light theme (`theme: "filled_black" | "outline"`).

## Preventing Data Loss

*   **Form State Saving:** When switching between tabs (like "Sign In" and "Create Account"), `saveFormState` and `restoreFormState` temporarily store the inputted text in memory so users don't lose typed data if they misclick.
*   **bfcache Handling:** A `pageshow` event listener detects if the page was loaded from the browser's back/forward cache (`event.persisted`) and forces a reload to prevent stale session states.
