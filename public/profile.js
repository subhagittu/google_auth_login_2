const API = 'https://google-auth-login-2-master.onrender.com/api';
let currentProfilePicture = null;
let cropper = null;

// ─── UTILS ────────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ─── INITIAL LOAD ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Theme
  const saved = localStorage.getItem('taskflow-theme') || 'dark';
  document.documentElement.setAttribute('data-theme', saved);

  // 2. Load User Data
  try {
    const res = await fetch(API + '/auth/me', { credentials: 'include' });
    if (!res.ok) throw new Error('Not logged in');
    const data = await res.json();
    
    document.getElementById('username').value = data.user.username;
    document.getElementById('email').value = data.user.email || '';
    
    const displayName = data.user.displayName || data.user.username;
    document.getElementById('display-name').value = displayName;
    
    const avatarEl = document.getElementById('avatar-preview');
    if (data.user.profilePicture) {
      currentProfilePicture = data.user.profilePicture;
      avatarEl.textContent = '';
      avatarEl.style.backgroundImage = `url(${currentProfilePicture})`;
    } else {
      avatarEl.textContent = displayName.charAt(0).toUpperCase();
    }
  } catch (err) {
    window.location.replace('login.html');
  }
});

// ─── FILE UPLOAD PREVIEW ─────────────────────────────────────────
document.getElementById('avatar-input').addEventListener('change', function(e) {
  const file = e.target.files[0];
  if (!file) return;
  
  if (file.size > 2 * 1024 * 1024) {
    showToast('Image must be less than 2MB', 'error');
    this.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function(event) {
    const modal = document.getElementById('crop-modal');
    const image = document.getElementById('cropper-image');
    
    // Destroy previous cropper instance if exists
    if (cropper) {
      cropper.destroy();
      cropper = null;
    }
    
    image.src = event.target.result;
    modal.classList.add('show');
    
    cropper = new Cropper(image, {
      aspectRatio: 1,
      viewMode: 1,
      autoCropArea: 1,
      background: false,
      dragMode: 'move'
    });
    
    // Clear input so same file can be selected again
    document.getElementById('avatar-input').value = '';
  };
  reader.readAsDataURL(file);
});

// ─── CROPPER MODAL CONTROLS ───────────────────────────────────────
function closeCropModal() {
  document.getElementById('crop-modal').classList.remove('show');
  if (cropper) {
    cropper.destroy();
    cropper = null;
  }
}

document.getElementById('crop-cancel-btn').addEventListener('click', closeCropModal);
document.getElementById('crop-cancel-btn-2').addEventListener('click', closeCropModal);

document.getElementById('crop-zoom-in-btn').addEventListener('click', () => {
  if (cropper) cropper.zoom(0.1);
});
document.getElementById('crop-zoom-out-btn').addEventListener('click', () => {
  if (cropper) cropper.zoom(-0.1);
});
document.getElementById('crop-reupload-btn').addEventListener('click', () => {
  document.getElementById('avatar-input').click();
});

document.getElementById('crop-confirm-btn').addEventListener('click', () => {
  if (!cropper) return;
  
  // Get cropped image as base64 (compressing slightly)
  const canvas = cropper.getCroppedCanvas({ width: 250, height: 250 });
  currentProfilePicture = canvas.toDataURL('image/jpeg', 0.85);
  
  // Update preview
  const avatarEl = document.getElementById('avatar-preview');
  avatarEl.textContent = '';
  avatarEl.style.backgroundImage = `url(${currentProfilePicture})`;
  
  closeCropModal();
});

// ─── SAVE CHANGES ─────────────────────────────────────────────────
document.getElementById('profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('save-btn');
  const displayName = document.getElementById('display-name').value.trim();
  
  if (!displayName) return showToast('Display name is required', 'error');
  
  btn.disabled = true;
  btn.textContent = 'Saving...';
  
  try {
    const res = await fetch(API + '/auth/profile', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        displayName,
        profilePicture: currentProfilePicture
      })
    });
    
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to update profile');
    
    showToast('Profile updated successfully!');
    setTimeout(() => window.location.replace('index.html'), 1000);
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Changes';
  }
});
