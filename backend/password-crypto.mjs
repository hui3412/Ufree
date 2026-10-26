import {DurableObject} from 'cloudflare:workers';
import {passwordHash} from './native-passwords.mjs';

// One coordinator per hashed username serializes memory-intensive password work.
// No password, salt, hash or account data is written to Durable Object storage.
export class PasswordCrypto extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.pending = Promise.resolve();
  }
  async derive(password, salt) {
    if (typeof password !== 'string' || !password.length ||
        typeof salt !== 'string' || !/^[a-f0-9]{64}$/.test(salt))
      throw Error('Invalid password derivation input.');
    const task = this.pending.then(() => passwordHash(password, salt));
    this.pending = task.then(() => undefined, () => undefined);
    return task;
  }
}
