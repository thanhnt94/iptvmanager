"""
Auth Router () — FastAPI, no Flask dependency.
"""
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from typing import Optional

from app.core.database import get_db
from app.core.auth_deps import (
    create_access_token, login_required, admin_required, get_current_user,
)
from app.modules.auth.models import User, UserPlaylist
from app.modules.auth.services import AuthService
from app.modules.settings.services import SettingService

router = APIRouter()


# --- Pydantic Schemas ---

class LoginRequest(BaseModel):
    username: str
    password: str
    remember: bool = False

class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    email: Optional[str] = None

class PasswordChangeRequest(BaseModel):
    old_password: str
    new_password: str

class CreateUserRequest(BaseModel):
    username: str
    email: str
    password: str
    role: str = 'user'

class RoleUpdateRequest(BaseModel):
    role: str


# --- Routes ---

@router.get("/me")
async def me(user: Optional[User] = Depends(get_current_user)):
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return {
        'id': user.id,
        'username': user.username,
        'email': user.email,
        'full_name': user.full_name,
        'role': user.role,
        'api_token': user.api_token,
        'avatar_initial': user.username[0].upper() if user.username else '?',
    }


@router.get("/config")
async def get_config(
    force_local: bool = False,
    db: Session = Depends(get_db),
):
    from app.modules.settings.models import SystemSetting
    use_sso = db.query(SystemSetting).filter_by(key='USE_CENTRAL_AUTH').first()
    is_sso_active = use_sso.value.lower() == 'true' if use_sso else False
    if force_local:
        is_sso_active = False
    return {
        "use_sso": is_sso_active,
        "tenant_id": "iptv-manager",
        "app_name": "IPTV Manager",
    }


@router.post("/login")
async def login(
    data: LoginRequest,
    response: Response,
    db: Session = Depends(get_db),
):
    user = AuthService.get_user_by_username(db, data.username)
    if not user or not user.check_password(data.password):
        raise HTTPException(status_code=401, detail="Invalid credentials")

    token = create_access_token(user.id, user.username, user.role)

    # Set cookie for browser clients
    max_age = 30 * 24 * 60 * 60 if data.remember else 24 * 60 * 60
    response.set_cookie(
        key="access_token",
        value=token,
        max_age=max_age,
        httponly=True,
        samesite="lax",
    )

    return {
        'status': 'ok',
        'token': token,
        'user': {
            'id': user.id,
            'username': user.username,
            'role': user.role,
            'api_token': user.api_token,
        },
    }


@router.post("/logout")
async def logout(response: Response):
    response.delete_cookie("access_token")
    return {'status': 'ok'}


@router.patch("/profile")
async def update_profile(
    data: ProfileUpdateRequest,
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    success, message = AuthService.update_profile(db, user.id, data.full_name, data.email)
    if success:
        return {'status': 'ok', 'message': message}
    raise HTTPException(status_code=400, detail=message)


@router.post("/change-password")
async def change_password(
    data: PasswordChangeRequest,
    user: User = Depends(login_required),
    db: Session = Depends(get_db),
):
    success, message = AuthService.change_password(db, user.id, data.old_password, data.new_password)
    if success:
        return {'status': 'ok', 'message': message}
    raise HTTPException(status_code=400, detail=message)


@router.get("/users")
async def get_users(
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    users = AuthService.get_all_users(db)
    result = []
    for u in users:
        accesses = db.query(UserPlaylist).filter_by(user_id=u.id).all()
        result.append({
            'id': u.id,
            'username': u.username,
            'email': u.email,
            'role': u.role,
            'playlists': [a.playlist_id for a in accesses],
        })
    return result


@router.post("/users")
async def create_user(
    data: CreateUserRequest,
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    new_user, error = AuthService.create_user(db, data.username, data.email, data.password, data.role)
    if new_user:
        return {'status': 'ok', 'id': new_user.id}
    raise HTTPException(status_code=400, detail=error)


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    if AuthService.delete_user(db, user_id):
        return {'status': 'ok'}
    raise HTTPException(status_code=400, detail="Cannot delete this user")


@router.post("/toggle-access/{user_id}/{playlist_id}")
async def toggle_access(
    user_id: int,
    playlist_id: int,
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    AuthService.toggle_playlist_access(db, user_id, playlist_id)
    return {'status': 'ok'}


@router.post("/users/{user_id}/role")
async def update_user_role(
    user_id: int,
    data: RoleUpdateRequest,
    user: User = Depends(admin_required),
    db: Session = Depends(get_db),
):
    if AuthService.update_user_role(db, user_id, data.role):
        return {'status': 'ok'}
    raise HTTPException(status_code=400, detail="Failed to update role")

