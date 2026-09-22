const db = require('../config/db');


async function listClients(req, res, next) {
  try {
    const { search = '', page = 1, limit = 20 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const values = [];
    let where = 'WHERE is_active = TRUE';

    if (search) {
      values.push(`%${search}%`);
      where += ` AND (name ILIKE $${values.length} OR email ILIKE $${values.length})`;
    }

    const countResult = await db.query(`SELECT COUNT(*)::int AS total FROM clients ${where}`, values);

    values.push(limitNum, offset);
    const dataResult = await db.query(
      `SELECT id, name, email, phone, notes, created_at, updated_at
       FROM clients ${where}
       ORDER BY created_at DESC
       LIMIT $${values.length - 1} OFFSET $${values.length}`,
      values
    );

    return res.json({
      data: dataResult.rows,
      pagination: {
        total: countResult.rows[0].total,
        page: pageNum,
        limit: limitNum,
      },
    });
  } catch (err) {
    return next(err);
  }
}

async function getClient(req, res, next) {
  try {
    const { id } = req.params;
    const result = await db.query(
      `SELECT id, name, email, phone, notes, created_at, updated_at
       FROM clients WHERE id = $1 AND is_active = TRUE`,
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }
    return res.json({ data: result.rows[0] });
  } catch (err) {
    return next(err);
  }
}

async function createClient(req, res, next) {
  try {
    const { name, email, phone, notes } = req.body;

    if (!name || !email) {
      return res.status(400).json({ error: 'Nome e e-mail são obrigatórios.' });
    }

    const result = await db.query(
      `INSERT INTO clients (name, email, phone, notes, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$5)
       RETURNING id, name, email, phone, notes, created_at, updated_at`,
      [name.trim(), email.trim().toLowerCase(), phone || null, notes || null, req.user.sub]
    );

    const client = result.rows[0];

    await req.audit('CLIENT_CREATE', { entity: 'client', entityId: client.id, statusCode: 201, details: { name: client.name } });

    return res.status(201).json({ message: 'Cliente cadastrado com sucesso.', data: client });
  } catch (err) {
    return next(err);
  }
}

async function updateClient(req, res, next) {
  try {
    const { id } = req.params;
    const { name, email, phone, notes } = req.body;

    const existing = await db.query('SELECT id FROM clients WHERE id = $1 AND is_active = TRUE', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    const result = await db.query(
      `UPDATE clients
       SET name = COALESCE($1, name),
           email = COALESCE($2, email),
           phone = $3,
           notes = $4,
           updated_by = $5
       WHERE id = $6
       RETURNING id, name, email, phone, notes, created_at, updated_at`,
      [name, email, phone || null, notes || null, req.user.sub, id]
    );

    const client = result.rows[0];

    await req.audit('CLIENT_UPDATE', { entity: 'client', entityId: client.id, statusCode: 200, details: { name: client.name } });

    return res.json({ message: 'Cliente atualizado com sucesso.', data: client });
  } catch (err) {
    return next(err);
  }
}

async function deleteClient(req, res, next) {
  try {
    const { id } = req.params;

    const result = await db.query(
      `UPDATE clients SET is_active = FALSE, updated_by = $1 WHERE id = $2 AND is_active = TRUE RETURNING id, name`,
      [req.user.sub, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    await req.audit('CLIENT_DELETE', { entity: 'client', entityId: id, statusCode: 200, details: { name: result.rows[0].name } });

    return res.json({ message: 'Cliente removido com sucesso.' });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listClients, getClient, createClient, updateClient, deleteClient };
