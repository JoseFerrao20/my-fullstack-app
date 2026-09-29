from app.core.envelope import ApiError
from app.core.security import hash_password, verify_password
from app.features.auth.models import User
from app.features.auth.repository import UserRepository
from app.features.auth.schemas import LoginIn, SignupIn


class AuthService:
    def __init__(self, users: UserRepository):
        self.users = users

    def signup(self, payload: SignupIn) -> User:
        if self.users.get_by_email(payload.email):
            raise ApiError(409, "EMAIL_TAKEN", "An account with this email already exists")
        return self.users.create(
            email=payload.email,
            name=payload.name,
            hashed_password=hash_password(payload.password),
        )

    def authenticate(self, payload: LoginIn) -> User:
        user = self.users.get_by_email(payload.email)
        if not user or not verify_password(payload.password, user.hashed_password):
            raise ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password")
        return user
