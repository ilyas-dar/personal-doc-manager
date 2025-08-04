# 🔐 Authentication Setup Guide

## Quick Setup

### 1. Change Default Credentials

Edit the `auth-config.json` file:

```json
{
  "enabled": true,
  "username": "your-username",
  "password": "your-secure-password",
  "sessionTimeout": 3600000
}
```

**Replace:**
- `your-username` with your desired username
- `your-secure-password` with a strong password

### 2. Deploy Changes

```bash
git add .
git commit -m "Add authentication"
git push
```

### 3. Test Login

1. Go to your app URL
2. You'll be redirected to login page
3. Enter your credentials
4. Access your documents securely!

## 🔒 Security Features

- **Session-based authentication**
- **Automatic session timeout** (1 hour by default)
- **Secure cookie handling**
- **Protected API endpoints**
- **Logout functionality**

## ⚙️ Configuration Options

### Disable Authentication
```json
{
  "enabled": false
}
```

### Change Session Timeout
```json
{
  "sessionTimeout": 7200000  // 2 hours in milliseconds
}
```

### Multiple Users (Future Feature)
Currently supports single user. Multiple users can be added later.

## 🚨 Security Tips

1. **Use a strong password** (12+ characters, mix of letters, numbers, symbols)
2. **Don't share credentials** publicly
3. **Change password regularly**
4. **Use HTTPS** (automatic with Render)

## 🔧 Troubleshooting

**Can't login?**
- Check username/password in `auth-config.json`
- Make sure changes are deployed
- Clear browser cookies

**Want to disable auth temporarily?**
- Set `"enabled": false` in `auth-config.json`
- Deploy changes

**Session expired?**
- Just login again
- Sessions expire after 1 hour by default 