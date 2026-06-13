const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { adminOnly } = require('../middleware/auth');
const bcrypt = require('bcrypt');

// GET /admin/stats
router.get('/stats', adminOnly, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeUsers = await User.countDocuments({ status: 'active' });
    const disabledUsers = await User.countDocuments({ status: 'disabled' });
    const adminUsers = await User.countDocuments({ role: 'admin' });
    const pendingApprovals = await User.countDocuments({ approvalStatus: 'pending' });
    res.json({
      overview: {
        totalUsers, activeUsers, disabledUsers, adminUsers, pendingApprovals,
        // Documents stats will come from document-service
        totalDocuments: 0, processedDocuments: 0, processingDocuments: 0, failedDocuments: 0
      },
      storage: { /* will be filled by document-service */ },
      services: [] // will be aggregated by gateway
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// GET /admin/users
router.get('/users', adminOnly, async (req, res) => {
  const users = await User.find().select('-password');
  res.json(users);
});

// POST /admin/users (create)
router.post('/users', adminOnly, async (req, res) => {
  const { name, email, password, role, status, approvalStatus } = req.body;
  const hashed = await bcrypt.hash(password, 10);
  const user = new User({ name, email, password: hashed, role, status, approvalStatus, requestedRole: role, createdAt: new Date() });
  await user.save();
  res.status(201).json({ message: 'User created', userId: user.id });
});

// PUT /admin/users/:id
router.put('/users/:id', adminOnly, async (req, res) => {
  const { name, email, password, role, status, approvalStatus } = req.body;
  const update = { name, email, role, status, approvalStatus, updatedAt: new Date() };
  if (password) update.password = await bcrypt.hash(password, 10);
  await User.findByIdAndUpdate(req.params.id, update);
  res.json({ message: 'User updated' });
});

// DELETE /admin/users/:id
router.delete('/users/:id', adminOnly, async (req, res) => {
  await User.findByIdAndDelete(req.params.id);
  res.json({ message: 'User deleted' });
});

// POST /admin/users/:id/approve
router.post('/users/:id/approve', adminOnly, async (req, res) => {
  await User.findByIdAndUpdate(req.params.id, { role: 'admin', approvalStatus: 'approved' });
  res.json({ message: 'Approved' });
});

// POST /admin/users/:id/reject
router.post('/users/:id/reject', adminOnly, async (req, res) => {
  await User.findByIdAndUpdate(req.params.id, { approvalStatus: 'rejected' });
  res.json({ message: 'Rejected' });
});

module.exports = router;