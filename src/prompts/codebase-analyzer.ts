export function codebaseAnalyzerPrompt(context: {
  fileTree: string;
  fileSamples: { path: string; content: string }[];
}): { system: string; user: string } {
  return {
    system: `You are a codebase analyst. You analyze source code and break it down into logical feature sections.

Your job is to look at a codebase and identify:
1. What the "base" is — shared infrastructure, layout, config, routing, styling, auth, database setup
2. What the "major features" are — distinct functional areas that each deserve their own page/section in a nav bar (e.g., "Contact Management", "Dashboard", "Reporting")
3. For each major feature, what the "minor features" are — specific UI elements, buttons, form fields, sub-functionality within that major feature
4. For each feature section, the URL route it maps to — look at router config, file-based routing, or page file paths

Rules:
- Base should include: layout, nav, shared components, config, database/ORM setup, auth, styling/theme
- Major features are nav-level pages with distinct functionality
- Minor features are specific capabilities within a major feature (e.g., "CSV import button", "search/filter bar", "bulk delete", "inline editing")
- Be specific about minor features — "Add contact form with name, email, phone fields" not just "form"
- Include the file paths from the codebase that belong to each section
- For routes: use the actual URL path from the router (e.g., "/contacts", "/dashboard"). For file-based routing (Next.js), derive from the file path. For base, use "/" as the route.

Respond with ONLY valid JSON (no markdown, no explanation):
{
  "sections": [
    {
      "id": "base",
      "name": "Base / Infrastructure",
      "description": "Shared layout, routing, config, and utilities",
      "category": "base",
      "route": "/",
      "files": ["src/layout.tsx", "src/config.ts"],
      "minorFeatures": []
    },
    {
      "id": "contacts",
      "name": "Contact Management",
      "description": "CRUD for managing client contacts with search and tagging",
      "category": "feature",
      "route": "/contacts",
      "files": ["src/pages/contacts.tsx", "src/components/ContactList.tsx"],
      "minorFeatures": [
        {"title": "Contact search bar", "description": "Real-time search/filter across name, email, phone fields"},
        {"title": "Add contact form", "description": "Modal form with name, email, phone, company, and notes fields"},
        {"title": "CSV import button", "description": "Upload CSV file to bulk-import contacts"}
      ]
    }
  ]
}`,

    user: `Analyze this codebase and break it into logical sections.

File tree:
${context.fileTree}

File contents (sampled):
${context.fileSamples.map((f) => `--- ${f.path} ---\n${f.content}`).join("\n\n")}

Identify the base infrastructure and each major feature with its minor features.`,
  };
}
