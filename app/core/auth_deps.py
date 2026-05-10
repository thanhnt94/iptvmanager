"""
auth_deps.py — FastAPI Authentication Dependencies (JWT-based)

Replaces Flask-Login entirely. Provides:
- JWT token creation/verification
- get_current_user dependency
- login_required dependency  
- admin_required dependency
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.config import Config
from app.core.database import get_db
from app.modules.auth.models import User

logger = logging.getLogger('iptv')

SECRET_KEY = Config.SECRET_KEY
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 30

security = HTTPBearer(auto_error=False)


def create_access_token(user_id: int, username: str, role: str) -> str:
    """Creates a JWT access token."""
    expire = datetime.now(timezone.utc) + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": str(user_id),
        "username": username,
        "role": role,
        "exp": expire,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    """Decodes and validates a JWT token."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db),
) -> Optional[User]:
    """
    Extracts the current user from:
    1. Authorization: Bearer <jwt_token> header
    2. Cookie: access_token=<jwt_token>
    
    Returns None if no valid auth found (allows optional auth routes).
    """
    token = None

    # 1. Try Bearer header
    if credentials:
        token = credentials.credentials

    # 2. Try cookie
    if not token:
        token = request.cookies.get("access_token")

    if not token:
        return None

    payload = decode_token(token)
    if not payload:
        return None

    user_id = payload.get("sub")
    if not user_id:
        return None

    user = db.query(User).get(int(user_id))
    if not user or not user.is_active:
        return None

    return user


async def login_required(
    user: Optional[User] = Depends(get_current_user),
) -> User:
    """Dependency that enforces authentication."""
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def admin_required(
    user: User = Depends(login_required),
) -> User:
    """Dependency that enforces admin role."""
    if user.role != 'admin':
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin privileges required",
        )
    return user

