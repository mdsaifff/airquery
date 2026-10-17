"""All agent configuration, read from environment variables / agent/.env."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

AGENT_DIR = Path(__file__).parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=AGENT_DIR / ".env", extra="ignore")

    llm_provider: str = ""
    llm_model: str = ""
    llm_api_key: str = ""
    schema_dir: Path = AGENT_DIR / "../web/public/data"
    # Comma-separated list of allowed browser origins (CORS).
    web_origin: str = "http://localhost:5173,http://localhost:4173"
    # AI questions (POST /query) per visitor IP per minute.
    rate_limit_per_min: int = 6
    # Chart clicks and share links (POST /compile, no LLM) per visitor IP per minute.
    compile_rate_limit_per_min: int = 60
    # AI questions per minute across all visitors (~2.1k tokens each). A Groq free key allows
    # 8k tokens/min, so 5 is a little over on purpose: more questions, and an occasional
    # provider 429 becomes the friendly "busy" reply. Raise it with a paid tier.
    llm_calls_per_min: int = 5

    @property
    def web_origins(self) -> list[str]:
        return [o.strip() for o in self.web_origin.split(",") if o.strip()]


settings = Settings()
