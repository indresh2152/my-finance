import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Avatar,
  Divider,
  IconButton,
  ListItemIcon,
  ListItemText,
  ListSubheader,
  Menu,
  MenuItem,
  Typography,
} from '@mui/material';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import LogoutIcon from '@mui/icons-material/Logout';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';

const BUTTON_ID = 'user-menu-button';
const MENU_ID = 'user-menu';
const AVATAR_SIZE = 32;

/** The header's account control: the user's initial opens a menu with Profile and Sign out. */
export const UserMenu: React.FC = () => {
  const { t } = useTranslation('common');
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  // The menu always anchors to the avatar. Anchoring to the clicked element and clearing it on close
  // left the closing menu with no anchor, so MUI placed it against the page's bottom-right corner.
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [isMenuOpen, setMenuOpen] = useState(false);

  if (!user) return null;

  const closeMenu = (): void => setMenuOpen(false);

  const openProfile = (): void => {
    closeMenu();
    navigate('/profile');
  };

  const signOut = async (): Promise<void> => {
    closeMenu();
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <>
      <IconButton
        id={BUTTON_ID}
        ref={buttonRef}
        onClick={() => setMenuOpen(true)}
        aria-label={t('userMenu.open')}
        aria-haspopup="true"
        aria-controls={isMenuOpen ? MENU_ID : undefined}
        aria-expanded={isMenuOpen ? 'true' : undefined}
        size="small"
      >
        <Avatar
          sx={{
            width: AVATAR_SIZE,
            height: AVATAR_SIZE,
            bgcolor: 'common.white',
            color: 'primary.main',
            fontWeight: 700,
          }}
        >
          {user.username.charAt(0).toUpperCase()}
        </Avatar>
      </IconButton>

      <Menu
        id={MENU_ID}
        anchorEl={buttonRef.current}
        open={isMenuOpen}
        onClose={closeMenu}
        MenuListProps={{ 'aria-labelledby': BUTTON_ID }}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {/* A subheader, not an option: MUI skips it when focusing the first item. */}
        <ListSubheader sx={{ lineHeight: 1.5, py: 1 }}>
          <Typography variant="subtitle2" fontWeight={700} color="text.primary">
            {user.username}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {user.email}
          </Typography>
        </ListSubheader>
        <Divider />
        <MenuItem onClick={openProfile}>
          <ListItemIcon>
            <PersonOutlineIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t('userMenu.profile')}</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => void signOut()}>
          <ListItemIcon>
            <LogoutIcon fontSize="small" />
          </ListItemIcon>
          <ListItemText>{t('userMenu.signOut')}</ListItemText>
        </MenuItem>
      </Menu>
    </>
  );
};
