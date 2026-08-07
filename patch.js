const fs = require('fs');
const file = 'public/login.html';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  `      const isRegister = m === 'register';
      const isForgot = m === 'forgot-password';
      const isForgotVerify = m === 'forgot-password-verify';
      const isLogin = m === 'login';
      const isComplete = m === 'complete';
      const isVerifyOtp = m === 'verify-otp';

      document.getElementById('group-displayname').style.display = isRegister ? 'block' : 'none';
      document.getElementById('group-email').style.display = (isRegister || isForgot) ? 'block' : 'none';
      document.getElementById('group-username').style.display = (isLogin || isRegister || isComplete) ? 'block' : 'none';
      document.getElementById('group-password').style.display = (isLogin || isRegister || isComplete || isForgotVerify) ? 'block' : 'none';
      document.getElementById('group-retype-password').style.display = isForgotVerify ? 'block' : 'none';
      
      document.getElementById('password-label').textContent = (isForgot || isForgotVerify) ? 'New Password' : 'Password';`,
  `      const isRegister = m === 'register';
      const isForgot = m === 'forgot-password';
      const isForgotVerify = m === 'forgot-password-verify';
      const isForgotReset = m === 'forgot-password-reset';
      const isLogin = m === 'login';
      const isComplete = m === 'complete';
      const isVerifyOtp = m === 'verify-otp';

      document.getElementById('group-displayname').style.display = isRegister ? 'block' : 'none';
      document.getElementById('group-email').style.display = (isRegister || isForgot) ? 'block' : 'none';
      document.getElementById('group-username').style.display = (isLogin || isRegister || isComplete) ? 'block' : 'none';
      document.getElementById('group-password').style.display = (isLogin || isRegister || isComplete || isForgotReset) ? 'block' : 'none';
      document.getElementById('group-retype-password').style.display = isForgotReset ? 'block' : 'none';
      
      document.getElementById('password-label').textContent = isForgotReset ? 'New Password' : 'Password';`
);

content = content.replace(
  `      let btnText = 'Sign In';
      if (isRegister) btnText = 'Create Account';
      if (isForgot) btnText = 'Send OTP';
      if (isForgotVerify) btnText = 'Reset Password';
      if (isVerifyOtp) btnText = 'Verify & Create Account';
      document.getElementById('submit-btn').textContent = btnText;
      
      document.getElementById('password').setAttribute('autocomplete', isLogin ? 'current-password' : 'new-password');
      
      // Enable/disable inputs based on mode
      document.getElementById('email').disabled = isForgotVerify || isVerifyOtp;
      document.getElementById('username').disabled = isVerifyOtp;`,
  `      let btnText = 'Sign In';
      if (isRegister) btnText = 'Create Account';
      if (isForgot) btnText = 'Send OTP';
      if (isForgotVerify) btnText = 'Verify';
      if (isForgotReset) btnText = 'Reset Password';
      if (isVerifyOtp) btnText = 'Verify & Create Account';
      document.getElementById('submit-btn').textContent = btnText;
      
      document.getElementById('password').setAttribute('autocomplete', isLogin ? 'current-password' : 'new-password');
      
      // Enable/disable inputs based on mode
      document.getElementById('email').disabled = isForgotVerify || isVerifyOtp || isForgotReset;
      document.getElementById('username').disabled = isVerifyOtp;`
);

content = content.replace(
  `      // Hide Google Auth if verifying OTP or completing google profile or forgot password
      const hideAuthTabs = isComplete || isForgot || isForgotVerify || isVerifyOtp;
      document.getElementById('auth-tabs').style.display = hideAuthTabs ? 'none' : 'flex';
      
      const hideGoogle = isComplete || isVerifyOtp || isForgot || isForgotVerify;`,
  `      // Hide Google Auth if verifying OTP or completing google profile or forgot password
      const hideAuthTabs = isComplete || isForgot || isForgotVerify || isForgotReset || isVerifyOtp;
      document.getElementById('auth-tabs').style.display = hideAuthTabs ? 'none' : 'flex';
      
      const hideGoogle = isComplete || isVerifyOtp || isForgot || isForgotVerify || isForgotReset;`
);

content = content.replace(
  `       if (mode === 'forgot-password' || mode === 'forgot-password-verify') {
         if (pw !== rpw) {`,
  `       if (mode === 'forgot-password-reset') {
         if (pw !== rpw) {`
);

content = content.replace(
  `      if ((mode === 'register' || mode === 'verify-otp' || mode === 'forgot-password' || mode === 'forgot-password-verify') && !email) {
        showAlert('Please enter your email address.');
        return;
      }
      if ((mode === 'verify-otp' || mode === 'forgot-password-verify') && !otp) {
        showAlert('Please enter the OTP sent to your email.');
        return;
      }
      if (mode === 'forgot-password-verify') {
        if (!password || !retypePw) {
          showAlert('Please enter and confirm your new password.');
          return;
        }
        if (password !== retypePw) {
          showAlert('Passwords do not match.');
          return;
        }
      }`,
  `      if ((mode === 'register' || mode === 'verify-otp' || mode === 'forgot-password' || mode === 'forgot-password-verify' || mode === 'forgot-password-reset') && !email) {
        showAlert('Please enter your email address.');
        return;
      }
      if ((mode === 'verify-otp' || mode === 'forgot-password-verify' || mode === 'forgot-password-reset') && !otp) {
        showAlert('Please enter the OTP sent to your email.');
        return;
      }
      if (mode === 'forgot-password-reset') {
        if (!password || !retypePw) {
          showAlert('Please enter and confirm your new password.');
          return;
        }
        if (password !== retypePw) {
          showAlert('Passwords do not match.');
          return;
        }
      }`
);

content = content.replace(
  `      else if (mode === 'forgot-password-verify') btn.textContent = 'Resetting Password...';

      try {
        let endpoint = '/auth/register';
        let body = { username, email, password, displayName };
        
        if (mode === 'login') {
          endpoint = '/auth/login';
          body = { username, password };
        } else if (mode === 'complete') {
          endpoint = '/auth/google/complete';
          body = { username, password };
        } else if (mode === 'register') {
          endpoint = '/auth/send-otp';
          body = { username, email, password };
        } else if (mode === 'verify-otp') {
          endpoint = '/auth/register';
          body = { username, email, password, displayName, otp };
        } else if (mode === 'forgot-password') {
          endpoint = '/auth/forgot-password-otp';
          body = { email };
        } else if (mode === 'forgot-password-verify') {
          endpoint = '/auth/reset-password';
          body = { email, otp, newPassword: password };
        }`,
  `      else if (mode === 'forgot-password-verify') btn.textContent = 'Verifying...';
      else if (mode === 'forgot-password-reset') btn.textContent = 'Resetting Password...';

      try {
        let endpoint = '/auth/register';
        let body = { username, email, password, displayName };
        
        if (mode === 'login') {
          endpoint = '/auth/login';
          body = { username, password };
        } else if (mode === 'complete') {
          endpoint = '/auth/google/complete';
          body = { username, password };
        } else if (mode === 'register') {
          endpoint = '/auth/send-otp';
          body = { username, email, password };
        } else if (mode === 'verify-otp') {
          endpoint = '/auth/register';
          body = { username, email, password, displayName, otp };
        } else if (mode === 'forgot-password') {
          endpoint = '/auth/forgot-password-otp';
          body = { email };
        } else if (mode === 'forgot-password-verify') {
          endpoint = '/auth/verify-reset-otp';
          body = { email, otp };
        } else if (mode === 'forgot-password-reset') {
          endpoint = '/auth/reset-password';
          body = { email, otp, newPassword: password };
        }`
);

content = content.replace(
  `          if (mode === 'register' || mode === 'forgot-password') {
            // OTP sent successfully
            showAlert('OTP sent to ' + email + '!', 'success');
            switchMode(mode === 'register' ? 'verify-otp' : 'forgot-password-verify');
            btn.disabled = false;
            
            if (mode === 'verify-otp') {
              // Disable other fields so user doesn't change them while verifying
              document.getElementById('username').disabled = true;
              document.getElementById('password').disabled = true;
              document.getElementById('displayname').disabled = true;
            }
          } else {
            showAlert('Success! Redirecting…', 'success');
            setTimeout(() => window.location.replace('index.html'), 900);
          }`,
  `          if (mode === 'register' || mode === 'forgot-password') {
            // OTP sent successfully
            showAlert('OTP sent to ' + email + '!', 'success');
            switchMode(mode === 'register' ? 'verify-otp' : 'forgot-password-verify');
            btn.disabled = false;
            
            if (mode === 'verify-otp') {
              // Disable other fields so user doesn't change them while verifying
              document.getElementById('username').disabled = true;
              document.getElementById('password').disabled = true;
              document.getElementById('displayname').disabled = true;
            }
          } else if (mode === 'forgot-password-verify') {
            showAlert('OTP Verified!', 'success');
            switchMode('forgot-password-reset');
            btn.disabled = false;
          } else {
            showAlert('Success! Redirecting…', 'success');
            setTimeout(() => window.location.replace('index.html'), 900);
          }`
);

content = content.replace(
  `        if (mode === 'verify-otp' || mode === 'forgot-password-verify') {
          const boxes = document.querySelectorAll('.otp-box');
          if(boxes.length) boxes[0].focus();
        }
        
        if (mode !== 'verify-otp' && mode !== 'forgot-password-verify') {
          btn.disabled = false;
        } else {
           const el = document.getElementById('auth-alert');
           if (el.className.includes('error')) {
             btn.disabled = false;
             btn.textContent = mode === 'verify-otp' ? 'Verify & Create Account' : 'Reset Password';
           }
        }`,
  `        if (mode === 'verify-otp' || mode === 'forgot-password-verify') {
          const boxes = document.querySelectorAll('.otp-box');
          if(boxes.length) boxes[0].focus();
        }
        
        if (mode !== 'verify-otp' && mode !== 'forgot-password-verify' && mode !== 'forgot-password-reset') {
          btn.disabled = false;
        } else {
           const el = document.getElementById('auth-alert');
           if (el.className.includes('error')) {
             btn.disabled = false;
             if (mode === 'verify-otp') btn.textContent = 'Verify & Create Account';
             if (mode === 'forgot-password-verify') btn.textContent = 'Verify';
             if (mode === 'forgot-password-reset') btn.textContent = 'Reset Password';
           }
        }`
);

fs.writeFileSync(file, content);
console.log('Patch complete.');
