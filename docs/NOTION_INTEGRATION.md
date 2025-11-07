# Notion Integration for src-to-kb

## Section 1: Setup Notion Integration

### Step 1: Create Integration

**Option 1: Direct URL (Recommended)**
1. Go to https://www.notion.so/my-integrations
2. Click **"+ New integration"**
3. Name it (e.g., "Vezlo KB")
4. Select your workspace
5. Click **"Submit"**
6. Copy the **"Internal Integration Token"** (starts with `secret_`)

**Option 2: Via Settings**
1. Open Notion Settings
2. Go to **Settings & members** → **Connections**
3. Click **"Develop or manage integrations"**
4. Click **"+ New integration"**
5. Name it (e.g., "Vezlo KB")
6. Select your workspace
7. Click **"Submit"**
8. Copy the **"Internal Integration Token"** (starts with `secret_`)

### Step 2: Grant Access to Pages/Databases

**Important**: You must grant access from the Integration's Access tab, not from the Share button.

1. Go to https://www.notion.so/my-integrations
2. Click on your integration name
3. Go to the **"Access"** tab
4. Click **"+ Add pages or databases"**
5. Select the pages or databases you want to analyze
6. Click **"Allow access"**

**Done!** Integration can now access those pages and databases.

---

## Section 2: Create Notion Knowledge Base

### Set API Key
```bash
export NOTION_API_KEY=secret_your_key_here
```

### Fetch Single Page
```bash
# By URL (auto-detects page type)
src-to-kb --source=notion --notion-url="https://notion.so/Your-Page-abc123"
```

### Fetch All Pages from Database
```bash
# By URL (auto-detects database type)
src-to-kb --source=notion --notion-url="https://notion.so/Database-xyz789"
```

**Note**: The `--notion-url` option automatically detects whether the URL is a single page or a database. No need for separate options!

### Upload to External Server
```bash
EXTERNAL_KB_URL=https://your-server.com/api/knowledge/items \
EXTERNAL_KB_API_KEY=your-api-key \
src-to-kb --source=notion --notion-url="https://notion.so/Page-abc123"
```

### Output Location
```
knowledge-base/notion/
  ├── documents/
  ├── chunks/
  └── metadata/
```

---

## Troubleshooting

| Error | Solution |
|-------|----------|
| `Notion API key is required` | Set `NOTION_API_KEY` env var or use `--notion-key` |
| `Access denied` or `403` | Page/database not granted access - go to Integration → Access tab and add it |
| `Page not found` or `404` | Wrong page ID or page doesn't exist - verify URL is correct |
| `Invalid Notion URL` | Use full URL from browser address bar |
| `Database not found` | Make sure database is added in Integration → Access tab |

