const express = require('express');
const { z } = require('zod');
const authService = require('../services/auth.service');
const catchAsync = require('../utils/catchAsync');
const { validate } = require('../middleware/validate');
const { authLimiter } = require('../middleware/rateLimiter');
const auth = require('../middleware/auth');

const router = express.Router();

const signupSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(8),
    fullName: z.string().min(2).max(100),
  })
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email(),
    password: z.string().min(1),
  })
});

router.post(
  '/signup',
  authLimiter,
  validate(signupSchema),
  catchAsync(async (req, res) => {
    const { email, password, fullName } = req.validatedBody;
    const result = await authService.signup(email, password, fullName);
    res.status(201).json({ success: true, data: result });
  })
);

router.post(
  '/login',
  authLimiter,
  validate(loginSchema),
  catchAsync(async (req, res) => {
    const { email, password } = req.validatedBody;
    const result = await authService.login(email, password);
    res.status(200).json({ success: true, data: result });
  })
);

router.get(
  '/me',
  auth,
  catchAsync(async (req, res) => {
    const user = await authService.getProfile(req.user.id);
    res.status(200).json({ success: true, data: user });
  })
);

module.exports = router;
