/**
 * Privilege management for commands that may be run with sudo.
 *
 * When a user runs `sudo pugloo map ...`, the entire process runs as root.
 * Only /etc/hosts modification actually needs root — cert generation, mapping
 * storage, and daemon management should run as the real user so files are
 * created with the correct ownership.
 */

/**
 * Drop root privileges back to the real (invoking) user.
 * Only has an effect when running under sudo (SUDO_UID/SUDO_GID are set).
 * Returns true if privileges were dropped.
 */
export function dropPrivileges() {
  const uid = parseInt(process.env.SUDO_UID, 10);
  const gid = parseInt(process.env.SUDO_GID, 10);

  if (process.getuid() === 0 && !Number.isNaN(uid) && !Number.isNaN(gid)) {
    process.setgid(gid);
    process.setuid(uid);
    return true;
  }

  return false;
}
