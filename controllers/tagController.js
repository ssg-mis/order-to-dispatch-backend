const tagService = require('../services/tagService');
const Logger = require('../utils/logger');

async function getAllTags(req, res) {
  try {
    const result = await tagService.getAllTags(req.query);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    Logger.error('Error in getAllTags controller:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch tags', error: error.message });
  }
}

async function getTagById(req, res) {
  try {
    const tag = await tagService.getTagById(req.params.id);
    if (!tag) return res.status(404).json({ success: false, message: `Tag with ID ${req.params.id} not found` });
    res.status(200).json({ success: true, data: tag });
  } catch (error) {
    Logger.error('Error in getTagById controller:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch tag', error: error.message });
  }
}

async function createTag(req, res) {
  try {
    const tag = await tagService.createTag(req.body);
    res.status(201).json({ success: true, message: 'Tag created successfully', data: tag });
  } catch (error) {
    Logger.error('Error in createTag controller:', error);
    res.status(500).json({ success: false, message: 'Failed to create tag', error: error.message });
  }
}

async function updateTag(req, res) {
  try {
    const tag = await tagService.updateTag(req.params.id, req.body);
    res.status(200).json({ success: true, message: 'Tag updated successfully', data: tag });
  } catch (error) {
    Logger.error('Error in updateTag controller:', error);
    res.status(500).json({ success: false, message: 'Failed to update tag', error: error.message });
  }
}

async function deleteTag(req, res) {
  try {
    await tagService.deleteTag(req.params.id);
    res.status(200).json({ success: true, message: 'Tag deleted successfully' });
  } catch (error) {
    Logger.error('Error in deleteTag controller:', error);
    res.status(500).json({ success: false, message: 'Failed to delete tag', error: error.message });
  }
}

module.exports = { getAllTags, getTagById, createTag, updateTag, deleteTag };
