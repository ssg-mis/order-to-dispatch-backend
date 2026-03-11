/**
 * Var Calc Controller
 * Handles HTTP requests for variable calculations
 */

const varCalcService = require('../services/varCalcService');
const { ResponseUtil, Logger } = require('../utils');

/**
 * Get latest calculation variables
 */
const getLatestVarCalc = async (req, res, next) => {
    try {
        const data = await varCalcService.getLatest();
        return ResponseUtil.success(res, data, 'Latest variables fetched successfully');
    } catch (error) {
        Logger.error('Error in getLatestVarCalc controller', error);
        next(error);
    }
};

/**
 * Get all calculation variables (history)
 */
const getAllVarCalc = async (req, res, next) => {
    try {
        const data = await varCalcService.getAll();
        return ResponseUtil.success(res, data, 'Variable history fetched successfully');
    } catch (error) {
        Logger.error('Error in getAllVarCalc controller', error);
        next(error);
    }
};

/**
 * Save calculation variables
 */
const saveVarCalc = async (req, res, next) => {
    try {
        const data = req.body;
        const result = await varCalcService.save(data);
        return ResponseUtil.success(res, result, 'Variables saved successfully');
    } catch (error) {
        Logger.error('Error in saveVarCalc controller', error);
        next(error);
    }
};

module.exports = {
    getLatestVarCalc,
    getAllVarCalc,
    saveVarCalc
};
