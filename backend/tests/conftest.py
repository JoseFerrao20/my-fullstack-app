import os
from collections.abc import Iterator

os.environ.setdefault("ENABLE_SCHEDULER", "false")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.email import Email, get_email_sender
from app.models import Base
from main import app

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://taskapp:taskapp@localhost:5432/taskapp_test"
)


@pytest.fixture(scope="session")
def engine():
    engine = create_engine(TEST_DATABASE_URL)
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield engine
    Base.metadata.drop_all(engine)
    engine.dispose()


@pytest.fixture
def db(engine) -> Iterator[Session]:
    """A session whose commits become savepoints inside a transaction rolled back after the test."""
    connection = engine.connect()
    transaction = connection.begin()
    session = Session(
        bind=connection, join_transaction_mode="create_savepoint", expire_on_commit=False
    )
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


class Outbox:
    """Collects emails instead of sending them."""

    def __init__(self) -> None:
        self.sent: list[Email] = []

    def send(self, email: Email) -> None:
        self.sent.append(email)


@pytest.fixture
def outbox() -> Outbox:
    return Outbox()


@pytest.fixture
def client(db: Session, outbox: Outbox) -> Iterator[TestClient]:
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_email_sender] = lambda: outbox
    yield TestClient(app)
    app.dependency_overrides.clear()


def signup(client: TestClient, email: str = "alice@example.com", password: str = "password123"):
    return client.post(
        "/api/auth/signup", json={"email": email, "name": "Alice", "password": password}
    )


@pytest.fixture
def auth_client(client: TestClient) -> TestClient:
    assert signup(client).status_code == 201
    return client


@pytest.fixture
def other_client(client: TestClient) -> TestClient:
    """A second logged-in user sharing the same database session as `client`."""
    other = TestClient(app)
    assert signup(other, email="bob@example.com").status_code == 201
    return other
