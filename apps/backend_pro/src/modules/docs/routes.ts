import { Router } from 'express';
import { promises as fs } from 'fs';
import path from 'path';

const router = Router();

// Path to user-guide docs (relative to project root)
const DOCS_PATH = path.join(process.cwd(), '..', '..', 'docs', 'user-guide');

interface DocFile {
  slug: string;
  title: string;
  filename: string;
  order: number;
}

interface DocCategory {
  name: string;
  slug: string;
  order: number;
  docs: DocFile[];
}

/**
 * Extract title from markdown content
 */
function extractTitle(content: string, filename: string): string {
  // Try to get the first H1 heading
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) {
    return h1Match[1].trim();
  }
  
  // Fallback to filename
  return filename
    .replace('.md', '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Parse frontmatter from markdown (if exists)
 */
function parseFrontmatter(content: string): { frontmatter: Record<string, string>; body: string } {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  
  if (!frontmatterMatch) {
    return { frontmatter: {}, body: content };
  }

  const frontmatter: Record<string, string> = {};
  const lines = frontmatterMatch[1].split('\n');
  
  for (const line of lines) {
    const [key, ...valueParts] = line.split(':');
    if (key && valueParts.length > 0) {
      frontmatter[key.trim()] = valueParts.join(':').trim();
    }
  }

  return { frontmatter, body: frontmatterMatch[2] };
}

/**
 * Get all docs organized by category
 * GET /api/docs
 */
router.get('/', async (req, res, next) => {
  try {
    const entries = await fs.readdir(DOCS_PATH, { withFileTypes: true });
    const categories: DocCategory[] = [];
    const uncategorizedDocs: DocFile[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        // This is a category folder
        const categoryPath = path.join(DOCS_PATH, entry.name);
        const categoryFiles = await fs.readdir(categoryPath);
        const docs: DocFile[] = [];

        for (const file of categoryFiles) {
          if (file.endsWith('.md')) {
            const content = await fs.readFile(path.join(categoryPath, file), 'utf-8');
            const { frontmatter } = parseFrontmatter(content);
            const title = frontmatter.title || extractTitle(content, file);
            const order = parseInt(frontmatter.order || '999', 10);

            docs.push({
              slug: `${entry.name}/${file.replace('.md', '')}`,
              title,
              filename: file,
              order,
            });
          }
        }

        // Sort docs by order
        docs.sort((a, b) => a.order - b.order);

        // Parse category order from _category.json if exists
        let categoryOrder = 999;
        let categoryName = entry.name
          .replace(/-/g, ' ')
          .replace(/\b\w/g, (c) => c.toUpperCase());

        try {
          const categoryMeta = await fs.readFile(
            path.join(categoryPath, '_category.json'),
            'utf-8'
          );
          const meta = JSON.parse(categoryMeta);
          categoryOrder = meta.order || categoryOrder;
          categoryName = meta.name || categoryName;
        } catch {
          // No _category.json, use defaults
        }

        if (docs.length > 0) {
          categories.push({
            name: categoryName,
            slug: entry.name,
            order: categoryOrder,
            docs,
          });
        }
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        // Root-level doc
        const content = await fs.readFile(path.join(DOCS_PATH, entry.name), 'utf-8');
        const { frontmatter } = parseFrontmatter(content);
        const title = frontmatter.title || extractTitle(content, entry.name);
        const order = parseInt(frontmatter.order || '999', 10);

        uncategorizedDocs.push({
          slug: entry.name.replace('.md', ''),
          title,
          filename: entry.name,
          order,
        });
      }
    }

    // Sort categories by order
    categories.sort((a, b) => a.order - b.order);
    
    // Sort uncategorized docs by order
    uncategorizedDocs.sort((a, b) => a.order - b.order);

    // Add uncategorized docs as "General" category at the beginning
    if (uncategorizedDocs.length > 0) {
      categories.unshift({
        name: 'General',
        slug: '',
        order: 0,
        docs: uncategorizedDocs,
      });
    }

    res.json({
      success: true,
      data: categories,
    });
  } catch (error) {
    console.error('Failed to read docs:', error);
    res.json({
      success: true,
      data: [],
    });
  }
});

/**
 * Get a specific doc by slug
 * GET /api/docs/:slug or /api/docs/:category/:slug
 */
router.get('/:slug', async (req, res, next) => {
  try {
    const { slug } = req.params;
    const filePath = path.join(DOCS_PATH, `${slug}.md`);

    const content = await fs.readFile(filePath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);
    const title = frontmatter.title || extractTitle(content, `${slug}.md`);

    res.json({
      success: true,
      data: {
        slug,
        title,
        content: body,
        frontmatter,
      },
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      error: 'Document not found',
    });
  }
});

/**
 * Get a doc from a category
 * GET /api/docs/:category/:slug
 */
router.get('/:category/:slug', async (req, res, next) => {
  try {
    const { category, slug } = req.params;
    const filePath = path.join(DOCS_PATH, category, `${slug}.md`);

    const content = await fs.readFile(filePath, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);
    const title = frontmatter.title || extractTitle(content, `${slug}.md`);

    res.json({
      success: true,
      data: {
        slug: `${category}/${slug}`,
        title,
        content: body,
        frontmatter,
      },
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      error: 'Document not found',
    });
  }
});

export default router;
