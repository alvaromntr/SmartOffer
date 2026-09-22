const db = require('../config/db');


async function listProducts(req, res, next) {
  try {
    const { search = '' } = req.query;
    const values = [];
    let where = 'WHERE is_active = TRUE';

    if (search) {
      values.push(`%${search}%`);
      where += ` AND name ILIKE $${values.length}`;
    }

    const result = await db.query(
      `SELECT id, name, description, price, created_at, updated_at
       FROM products ${where}
       ORDER BY name ASC`,
      values
    );

    return res.json({ data: result.rows });
  } catch (err) {
    return next(err);
  }
}

async function getProduct(req, res, next) {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT id, name, description, price, created_at, updated_at
       FROM products WHERE id = $1 AND is_active = TRUE`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }
    return res.json({ data: result.rows[0] });
  } catch (err) {
    return next(err);
  }
}

async function createProduct(req, res, next) {
  try {
    const { name, description, price } = req.body;

    if (!name || price === undefined || price === null) {
      return res.status(400).json({ error: 'Nome e preço são obrigatórios.' });
    }
    if (Number(price) < 0) {
      return res.status(400).json({ error: 'O preço não pode ser negativo.' });
    }

    const result = await db.query(
      `INSERT INTO products (name, description, price, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$4)
       RETURNING id, name, description, price, created_at, updated_at`,
      [name.trim(), description || null, price, req.user.sub]
    );

    const product = result.rows[0];

    await req.audit('PRODUCT_CREATE', { entity: 'product', entityId: product.id, statusCode: 201, details: { name: product.name } });

    return res.status(201).json({ message: 'Produto cadastrado com sucesso.', data: product });
  } catch (err) {
    return next(err);
  }
}

async function updateProduct(req, res, next) {
  try {
    const { id } = req.params;
    const { name, description, price } = req.body;

    const existing = await db.query('SELECT id FROM products WHERE id = $1 AND is_active = TRUE', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }

    const result = await db.query(
      `UPDATE products
       SET name = COALESCE($1, name),
           description = $2,
           price = COALESCE($3, price),
           updated_by = $4
       WHERE id = $5
       RETURNING id, name, description, price, created_at, updated_at`,
      [name, description || null, price, req.user.sub, id]
    );

    const product = result.rows[0];

    await req.audit('PRODUCT_UPDATE', { entity: 'product', entityId: product.id, statusCode: 200, details: { name: product.name } });

    return res.json({ message: 'Produto atualizado com sucesso.', data: product });
  } catch (err) {
    return next(err);
  }
}

async function deleteProduct(req, res, next) {
  try {
    const { id } = req.params;

    const result = await db.query(
      `UPDATE products SET is_active = FALSE, updated_by = $1 WHERE id = $2 AND is_active = TRUE RETURNING id, name`,
      [req.user.sub, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }

    await req.audit('PRODUCT_DELETE', { entity: 'product', entityId: id, statusCode: 200, details: { name: result.rows[0].name } });

    return res.json({ message: 'Produto removido com sucesso.' });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listProducts, getProduct, createProduct, updateProduct, deleteProduct };
