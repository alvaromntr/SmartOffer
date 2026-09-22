const db = require('../config/db');


async function listSales(req, res, next) {
  try {
    const { clientId } = req.query;

    const values = [];
    let where = '';
    if (clientId) {
      values.push(clientId);
      where = `WHERE s.client_id = $${values.length}`;
    }

    const result = await db.query(
      `SELECT s.id, s.quantity, s.unit_price, s.sale_date, s.created_at,
              c.id AS client_id, c.name AS client_name,
              p.id AS product_id, p.name AS product_name
       FROM sales s
       JOIN clients c ON c.id = s.client_id
       JOIN products p ON p.id = s.product_id
       ${where}
       ORDER BY s.sale_date DESC, s.created_at DESC`,
      values
    );

    return res.json({ data: result.rows });
  } catch (err) {
    return next(err);
  }
}

async function createSale(req, res, next) {
  try {
    const { clientId, productId, quantity, saleDate } = req.body;

    if (!clientId || !productId) {
      return res.status(400).json({ error: 'Cliente e produto são obrigatórios.' });
    }

    const qty = Number(quantity) > 0 ? Number(quantity) : 1;

    const clientCheck = await db.query('SELECT id FROM clients WHERE id = $1 AND is_active = TRUE', [clientId]);
    if (clientCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Cliente não encontrado.' });
    }

    const productResult = await db.query('SELECT id, price FROM products WHERE id = $1 AND is_active = TRUE', [productId]);
    if (productResult.rows.length === 0) {
      return res.status(404).json({ error: 'Produto não encontrado.' });
    }

    const unitPrice = productResult.rows[0].price;

    const result = await db.query(
      `INSERT INTO sales (client_id, product_id, quantity, unit_price, sale_date, created_by)
       VALUES ($1,$2,$3,$4,COALESCE($5, CURRENT_DATE),$6)
       RETURNING id, client_id, product_id, quantity, unit_price, sale_date, created_at`,
      [clientId, productId, qty, unitPrice, saleDate || null, req.user.sub]
    );

    const sale = result.rows[0];

    await req.audit('SALE_CREATE', {
      entity: 'sale',
      entityId: sale.id,
      statusCode: 201,
      details: { clientId, productId, quantity: qty },
    });

    return res.status(201).json({ message: 'Venda registrada com sucesso.', data: sale });
  } catch (err) {
    return next(err);
  }
}

async function deleteSale(req, res, next) {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM sales WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Venda não encontrada.' });
    }

    await req.audit('SALE_DELETE', { entity: 'sale', entityId: id, statusCode: 200 });

    return res.json({ message: 'Venda removida com sucesso.' });
  } catch (err) {
    return next(err);
  }
}

module.exports = { listSales, createSale, deleteSale };
