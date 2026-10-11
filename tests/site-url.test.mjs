import test from 'node:test';
import assert from 'node:assert/strict';
import { getPublicSiteUrl } from '../lib/siteUrl.js';

const KEYS = ['NEXT_PUBLIC_SITE_URL', 'SITE_URL', 'VERCEL_PROJECT_PRODUCTION_URL'];

function withEnv(env, fn) {
  const saved = Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
  for (const key of KEYS) delete process.env[key];
  Object.assign(process.env, env);
  try {
    return fn();
  } finally {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
}

const localRequest = { url: 'http://localhost:3000/api/signing-requests' };

test('uses NEXT_PUBLIC_SITE_URL and trims trailing slashes', () => {
  withEnv({ NEXT_PUBLIC_SITE_URL: 'https://lawgda.vercel.app/' }, () => {
    assert.equal(getPublicSiteUrl(localRequest), 'https://lawgda.vercel.app');
  });
});

test('skips a localhost NEXT_PUBLIC_SITE_URL in favour of the Vercel production URL', () => {
  withEnv({ NEXT_PUBLIC_SITE_URL: 'http://localhost:3000', VERCEL_PROJECT_PRODUCTION_URL: 'lawgda.vercel.app' }, () => {
    assert.equal(getPublicSiteUrl(localRequest), 'https://lawgda.vercel.app');
  });
});

test('falls back to a public request origin', () => {
  withEnv({}, () => {
    assert.equal(getPublicSiteUrl({ url: 'https://lawgda.vercel.app/api/x' }), 'https://lawgda.vercel.app');
  });
});

test('refuses to produce a localhost link', () => {
  withEnv({}, () => {
    assert.throws(() => getPublicSiteUrl(localRequest), /NEXT_PUBLIC_SITE_URL/);
  });
});
