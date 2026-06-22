const fs = require("fs");

const DB_PATH = "./orders.json";

function loadOrders() {
  try { return JSON.parse(fs.readFileSync(DB_PATH)); }
  catch (e) { return []; }
}

function saveOrders(orders) {
  fs.writeFileSync(DB_PATH, JSON.stringify(orders, null, 2));
}

function createOrder({ customerName, customerPhone, items, notes, totalPrice }) {
  const orders = loadOrders();
  const order = {
    id: orders.length + 1,
    customerName,
    customerPhone,
    items,
    notes: notes || "",
    totalPrice: totalPrice || 0,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  orders.push(order);
  saveOrders(orders);
  return order;
}

function listOrders(status) {
  const orders = loadOrders();
  if (status) return orders.filter(o => o.status === status);
  return orders;
}

function getOrder(id) {
  return loadOrders().find(o => o.id === id) || null;
}

function setOrderStatus(id, status) {
  const orders = loadOrders();
  const order = orders.find(o => o.id === id);
  if (!order) return null;
  order.status = status;
  saveOrders(orders);
  return order;
}

module.exports = { createOrder, listOrders, getOrder, setOrderStatus };
