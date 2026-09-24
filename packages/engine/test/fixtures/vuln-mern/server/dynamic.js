const fs = require('fs');
const path = require('path');

module.exports = function loadRoutes(app) {
  fs.readdirSync(path.join(__dirname, 'plugins')).forEach((f) => {
    app.use('/plugins/' + f, require('./plugins/' + f));
  });
  ['a', 'b'].forEach((n) => app.get('/' + n, (req, res) => res.send(n)));
};
