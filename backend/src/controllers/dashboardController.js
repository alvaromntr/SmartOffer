const db = require('../config/db');

async function getSummary(req, res, next) {
  try {
    const userId = req.user.sub;

    const totalsResult = await db.query(
      `SELECT
         (SELECT COUNT(*)::int FROM clients  WHERE is_active = TRUE AND created_by = $1) AS clients,
         (SELECT COUNT(*)::int FROM products WHERE is_active = TRUE AND created_by = $1) AS products,
         (SELECT COUNT(*)::int FROM sales    WHERE created_by = $1) AS sales,
         (SELECT COALESCE(SUM(quantity * unit_price), 0) FROM sales WHERE created_by = $1) AS revenue`,
      [userId]
    );

    const topProductsResult = await db.query(
      `SELECT p.id, p.name,
              SUM(s.quantity)::int AS units,
              SUM(s.quantity * s.unit_price) AS revenue
       FROM sales s
       JOIN products p ON p.id = s.product_id
       WHERE s.created_by = $1
       GROUP BY p.id, p.name
       ORDER BY units DESC, revenue DESC
       LIMIT 5`,
      [userId]
    );

    const recentSalesResult = await db.query(
      `SELECT s.id, s.quantity, s.unit_price,
              to_char(s.sale_date, 'YYYY-MM-DD') AS sale_date,
              c.name AS client_name, p.name AS product_name
       FROM sales s
       JOIN clients c ON c.id = s.client_id
       JOIN products p ON p.id = s.product_id
       WHERE s.created_by = $1
       ORDER BY s.sale_date DESC, s.created_at DESC
       LIMIT 5`,
      [userId]
    );

    return res.json({
      data: {
        totals: totalsResult.rows[0],
        topProducts: topProductsResult.rows,
        recentSales: recentSalesResult.rows,
      },
    });
  } catch (err) {
    return next(err);
  }
}

module.exports = { getSummary };
