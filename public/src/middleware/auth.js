const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const config = require('../config/config');
const logger = require('../utils/logger');

// JWT verification client
let jwksClientInstance = null;

if (config.auth.mode === 'jwt' && config.auth.cognito.jwksUri) {
  jwksClientInstance = jwksClient({
    jwksUri: config.auth.cognito.jwksUri,
    cache: true,
    cacheMaxAge: 600000, // 10 minutes
  });
}

// Get signing key for JWT
function getKey(header, callback) {
  if (!jwksClientInstance) {
    return callback(new Error('JWKS client not initialized'));
  }

  jwksClientInstance.getSigningKey(header.kid, (err, key) => {
    if (err) {
      return callback(err);
    }
    const signingKey = key.publicKey || key.rsaPublicKey;
    callback(null, signingKey);
  });
}

// Verify JWT token
function verifyJWT(token) {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      {
        issuer: config.auth.cognito.issuer,
        algorithms: ['RS256'],
      },
      (err, decoded) => {
        if (err) {
          return reject(err);
        }
        resolve(decoded);
      },
    );
  });
}

// Check if token has required scopes
function hasRequiredScopes(tokenScopes, requiredScopes) {
  if (!requiredScopes || requiredScopes.length === 0) {
    return true;
  }

  const scopes = Array.isArray(tokenScopes) ? tokenScopes : (tokenScopes || '').split(' ');

  return requiredScopes.some((required) => scopes.includes(required));
}

// JWT Authentication Middleware
async function jwtAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header',
      });
    }

    const token = authHeader.substring(7);

    // Verify token
    const decoded = await verifyJWT(token);

    // Check scopes
    const requiredScopes = req.route?.meta?.scopes || [];
    if (requiredScopes.length > 0 && !hasRequiredScopes(decoded.scope, requiredScopes)) {
      return res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions',
        required: requiredScopes,
      });
    }

    // Attach user info to request
    req.user = {
      sub: decoded.sub,
      clientId: decoded.client_id,
      scopes: Array.isArray(decoded.scope) ? decoded.scope : (decoded.scope || '').split(' '),
    };

    next();
  } catch (error) {
    logger.error('JWT authentication failed', { error: error.message });
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Invalid or expired token',
    });
  }
}

// mTLS Authentication Middleware
function mtlsAuth(req, res, next) {
  try {
    // Check if client certificate is present
    const cert = req.socket.getPeerCertificate();

    if (!cert || !cert.subject) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Client certificate required',
      });
    }

    // Verify certificate is valid
    if (!req.client.authorized) {
      return res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid client certificate',
        reason: req.socket.authorizationError,
      });
    }

    // Attach certificate info to request
    req.user = {
      subject: cert.subject,
      issuer: cert.issuer,
      cn: cert.subject.CN,
    };

    logger.debug('mTLS authentication successful', {
      cn: cert.subject.CN,
    });

    next();
  } catch (error) {
    logger.error('mTLS authentication failed', { error: error.message });
    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Certificate verification failed',
    });
  }
}

// Main authentication middleware (switches based on config)
function authenticate(requiredScopes = []) {
  return async (req, res, next) => {
    // Store required scopes in route metadata
    req.route = req.route || {};
    req.route.meta = { scopes: requiredScopes };

    if (config.auth.mode === 'jwt') {
      return jwtAuth(req, res, next);
    } else if (config.auth.mode === 'mtls') {
      return mtlsAuth(req, res, next);
    } else {
      return res.status(500).json({
        error: 'InternalServerError',
        message: 'Invalid authentication mode configured',
      });
    }
  };
}

module.exports = {
  authenticate,
  jwtAuth,
  mtlsAuth,
};
