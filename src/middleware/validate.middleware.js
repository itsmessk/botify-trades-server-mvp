const { ZodError } = require('zod');

// Zod validation middleware factory
const validate = (schema) => {
  return (req, res, next) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const errors = error.errors.map((e) => ({
          field: e.path.join('.'),
          message: e.message,
        }));
        return res.status(400).json({ message: 'Validation failed', errors });
      }
      next(error);
    }
  };
};

module.exports = { validate };
