# Project Roadmap

This document outlines the planned development phases for the TNG HRIS System.

## Wave 1 – Core HR & Disciplinary System (MVP) - ✅ Complete

This initial phase focused on building the core frontend functionality with mock data to establish the user experience and feature set.

*   **Features Completed**:
    *   Employee 201 File Management
    *   Onboarding Checklists & Tasks
    *   Incident Reporting Pipeline (IR -> NTE -> Resolution)
    *   Role-Based Access Control (RBAC) System
    *   Core Payroll Modules (Timekeeping, OT, Leave)
    *   Recruitment Pipeline (Requisition -> Offer)
    *   Helpdesk System (Tickets, Announcements, Calendar)
    *   Administrative Panels

## Wave 2 – Backend Integration & Production Readiness

This phase will replace the mock data layer with a real, scalable backend infrastructure.

*   **Key Initiatives**:
    *   **Develop a Backend API**: Create a RESTful or GraphQL API (e.g., using Node.js/Express) to handle all data operations.
    *   **Database Migration**:
        *   Implement a **PostgreSQL** database (e.g., on Google Cloud SQL) for all structured relational data (users, payroll, etc.).
        *   Integrate **Google Cloud Storage** for all file uploads (resumes, contracts, photos).
        *   Utilize **Firestore** for real-time features like the case management chat.
    *   **Authentication**: Replace mock login with a secure authentication system (e.g., JWT-based).
    *   **Deployment**: Set up a CI/CD pipeline to deploy the frontend to a static host (like Vercel) and the backend to a cloud service (like Google Cloud Run).

## Wave 3 – Advanced Features & Automation

This phase will build upon the stable backend to introduce more complex and automated features.

*   **Key Initiatives**:
    *   **Full-Featured Loan Application System**: Implement loan types, approval workflows, and payroll deduction integration.
    *   **Advanced Payroll Calculations**: Integrate logic for government contributions (SSS, PhilHealth, Pag-IBIG) and tax calculations.
    *   **Automated Reporting**: Generate and email scheduled reports (e.g., monthly attendance summaries).
    *   **Performance Dashboards**: Create analytics dashboards to visualize key HR metrics.
    *   **Calendar Integration**: Sync leave and interview schedules with Google Calendar or Outlook.

## Wave 4 – Mobile & Third-Party Integrations

This phase focuses on expanding the platform's reach and connectivity.

*   **Key Initiatives**:
    *   **Native Mobile App**: Develop a mobile application for iOS and Android focusing on employee self-service features (Clock-in/out, leave requests, payslip viewing).
    *   **API Integrations**: Connect with third-party software such as accounting systems (e.g., QuickBooks, Xero) or other enterprise tools.
    *   **Biometrics Integration**: Explore integration with hardware-based biometric devices for timekeeping.
