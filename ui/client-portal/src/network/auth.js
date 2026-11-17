import NETWORK from './network'

export const authEndpoints = {
  async signin(data) {
    return await NETWORK.post('/auth/customer', data)
  },

  async signup(data) {
    const { customerName, customerEmail, password } = data;
    if (!customerName?.trim() || !customerEmail?.trim() || !password) {
      throw new Error('All fields are required');
    }
    if (!/\S+@\S+\.\S+/.test(customerEmail)) {
      throw new Error('Invalid email');
    }
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters');
    }
    return NETWORK.post('/auth/sign-up', {
      customerName: customerName.trim(),
      customerEmail: customerEmail.trim(),
      password,
    });
  }
}