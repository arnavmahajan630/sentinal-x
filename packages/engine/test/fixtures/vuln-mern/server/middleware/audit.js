module.exports.auditLog = (req, res, next) => {
  console.log(req.method, req.url);
  next();
};
