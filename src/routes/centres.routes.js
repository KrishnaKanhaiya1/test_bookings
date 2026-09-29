const express = require('express');
const centresService = require('../services/centres.service');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { getPaginationParams, buildPaginationResponse } = require('../utils/pagination');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates a given ID to ensure it is a valid UUID.
 * @param {string} id
 * @param {string} [name='ID']
 */
function validateUUID(id, name = 'ID') {
  if (!UUID_REGEX.test(id)) {
    throw ApiError.badRequest(`Invalid ${name} format`);
  }
}

// ----------------------
// Centres Router
// ----------------------
const centresRouter = express.Router();

centresRouter.get('/', catchAsync(async (req, res) => {
  const paginationParams = getPaginationParams(req.query);
  const city = req.query.city;
  
  const { centres, total } = await centresService.listCentres({ ...paginationParams, city });
  
  const response = buildPaginationResponse(centres, total, paginationParams.page, paginationParams.limit);
  res.status(200).json({ success: true, ...response });
}));

centresRouter.get('/:id', catchAsync(async (req, res) => {
  validateUUID(req.params.id, 'Centre ID');
  const centre = await centresService.getCentreById(req.params.id);
  res.status(200).json({ success: true, data: centre });
}));

centresRouter.get('/:id/tests', catchAsync(async (req, res) => {
  validateUUID(req.params.id, 'Centre ID');
  const paginationParams = getPaginationParams(req.query);
  
  const { tests, total } = await centresService.getCentreTests(req.params.id, paginationParams);
  
  const response = buildPaginationResponse(tests, total, paginationParams.page, paginationParams.limit);
  res.status(200).json({ success: true, ...response });
}));

// ----------------------
// Tests Router
// ----------------------
const testsRouter = express.Router();

testsRouter.get('/', catchAsync(async (req, res) => {
  const paginationParams = getPaginationParams(req.query);
  
  const { tests, total } = await centresService.listTests(paginationParams);
  
  const response = buildPaginationResponse(tests, total, paginationParams.page, paginationParams.limit);
  res.status(200).json({ success: true, ...response });
}));

testsRouter.get('/:id/centres', catchAsync(async (req, res) => {
  validateUUID(req.params.id, 'Test ID');
  const paginationParams = getPaginationParams(req.query);
  
  const { centres, total } = await centresService.getTestCentres(req.params.id, paginationParams);
  
  const response = buildPaginationResponse(centres, total, paginationParams.page, paginationParams.limit);
  res.status(200).json({ success: true, ...response });
}));

module.exports = {
  centresRouter,
  testsRouter
};
