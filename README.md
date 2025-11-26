# TNG HRIS System

This project is the backbone for a modern Human Resource Information System (HRIS), featuring a comprehensive Employee 201 File, an onboarding module, and an incident resolution system with role-based access control (RBAC).

## Core Features (Wave 1 - MVP)

*   **Employee Management**: Core 201 file, employee list, and profile management with an approval workflow for changes.
*   **Onboarding**: Customizable onboarding checklists and task management for new hires.
*   **Disciplinary System**: A robust incident reporting pipeline, from initial report to NTE issuance and final resolution, complete with a chat thread for case collaboration.
*   **Role-Based Access Control (RBAC)**: A sophisticated permissions system that tailors the UI and access rights based on user roles (e.g., Employee, Manager, HR, Admin).
*   **Payroll Essentials**: Modules for timekeeping, clock-in/out, overtime, leave requests, and payroll preparation.
*   **Performance Evaluation**: Tools for creating, conducting, and reviewing employee performance evaluations.
*   **Recruitment Module**: A complete pipeline from job requisition and posting to applicant tracking, interviews, and offers.
*   **Helpdesk & Corporate Comms**: Includes ticketing, announcements, a company calendar, and an organizational chart.
*   **Admin Dashboard**: Centralized control over roles, permissions, users, and system settings.

## Tech Stack

*   **Frontend**: React 19 with functional components and hooks.
*   **Routing**: `react-router-dom` for client-side navigation.
*   **Styling**: Tailwind CSS for a utility-first design approach.
*   **State Management**: React Context API for authentication and global settings.
*   **Backend**: Currently simulated with a mock API (`/services/mockApi.ts`) and an in-memory database (`/services/mockData.ts`) for rapid prototyping. User session is persisted in `localStorage`.

## Getting Started

This application is designed to run in a browser-based development environment. No local installation or build process is required. All dependencies are managed via an `importmap` in `index.html`.

1.  Open `index.html` in the development environment.
2.  The application will automatically load the entry point `index.tsx`.
3.  Use the default login credentials provided in `Login.tsx` to explore different user roles.
