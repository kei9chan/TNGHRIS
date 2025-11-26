# TNG HRIS System Architecture

This document outlines the software architecture of the TNG HRIS frontend application.

## 1. Overview

The application is a single-page application (SPA) built with React and TypeScript. It is designed to be a frontend-only prototype, meaning it does not connect to a real backend server. Instead, it simulates a backend using in-memory mock data and a mock API service.

## 2. Core Technologies

*   **UI Framework**: React 19 (using functional components and hooks).
*   **Language**: TypeScript.
*   **Routing**: `react-router-dom` using `HashRouter` for compatibility with static file servers.
*   **Styling**: Tailwind CSS for utility-first styling.

## 3. Directory Structure

The project is organized into the following key directories:

*   `/components`: Reusable UI components (`<Button>`, `<Card>`, etc.) and layout components (`Header`, `Layout`).
*   `/context`: React Context providers for managing global state (`AuthContext`, `SettingsContext`).
*   `/hooks`: Custom React hooks for shared logic (`useAuth`, `usePermissions`).
*   `/pages`: Top-level components that correspond to application routes/pages.
*   `/services`: Contains the mock backend logic.
    *   `mockData.ts`: The in-memory database. Contains arrays of users, incident reports, etc.
    *   `mockApi.ts`: Simulates asynchronous API calls (e.g., `mockLogin`).
    *   `deviceSecurity.ts`: Simulates device security checks.
    *   `auditService.ts`: A service for logging user actions.

## 4. State Management

Global application state is managed using React's Context API.

*   **`AuthContext`**: Manages the currently logged-in user, their session, and provides `login`/`logout` functions. It persists the user object in `localStorage` to simulate a session.
*   **`SettingsContext`**: Manages system-wide settings and feature toggles, such as enabling or disabling the RBAC system for demonstration purposes.

Component-level state is managed using `React.useState` and `React.useMemo`.

## 5. Routing

Routing is handled by `react-router-dom`.

*   **`App.tsx`**: Contains the main `Routes` definition.
*   **`ProtectedRoute`**: A wrapper component that checks for an authenticated user in `AuthContext`. If the user is not logged in, it redirects them to the `/login` page.
*   **`Layout.tsx`**: A primary layout component that includes the main `Header` and a dynamic sub-navigation bar based on the current URL path. It renders the page content via an `<Outlet />`.

## 6. Data Layer (Mock Backend)

Since this is a frontend prototype, the entire backend is simulated in the `/services` directory.

*   **`mockData.ts`**: This file acts as the database. It exports arrays of objects (e.g., `mockUsers`, `mockIncidentReports`) that represent database tables. This data is mutable and can be updated directly by other services to simulate database writes. The data is reset every time the application is reloaded.
*   **`mockApi.ts`**: This file simulates the asynchronous nature of a real API. Functions like `mockLogin` return a `Promise` and use `setTimeout` to mimic network latency.

## 7. Security

*   **Authentication**: The `login` flow in `AuthContext` checks credentials against `mockData.ts`. Upon success, the user object is stored in `localStorage`.
*   **Authorization (RBAC)**: The `usePermissions` hook provides a `can()` function. This function checks the current user's role (from `AuthContext`) against a permissions matrix defined in `mockData.ts`. UI elements and routes are conditionally rendered based on the output of this hook.
*   **Device Security**: The `deviceSecurity.ts` service simulates checking for a stable device ID and security flags (e.g., jailbreak/root). The `AuthContext` uses this to detect if a user is logging in from a new device, simulating a common security feature.
