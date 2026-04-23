use bollard::Docker;

#[tokio::test]
async fn test_docker_connection() {
    let result = Docker::connect_with_local_defaults();
    assert!(result.is_ok(), "Should connect to Docker daemon");
}

#[tokio::test]
async fn test_docker_version() {
    let docker = Docker::connect_with_local_defaults().unwrap();
    let result = docker.version().await;
    assert!(result.is_ok(), "Should get Docker version");
}

#[tokio::test]
async fn test_docker_info() {
    let docker = Docker::connect_with_local_defaults().unwrap();
    let result = docker.info().await;
    assert!(result.is_ok(), "Should get Docker info");
}

#[tokio::test]
async fn test_list_containers() {
    let docker = Docker::connect_with_local_defaults().unwrap();
    let result = docker.list_containers::<String>(None).await;
    assert!(result.is_ok(), "Should list containers");
}

#[tokio::test]
async fn test_list_images() {
    let docker = Docker::connect_with_local_defaults().unwrap();
    let result = docker.list_images::<String>(None).await;
    assert!(result.is_ok(), "Should list images");
}

#[tokio::test]
async fn test_list_networks() {
    let docker = Docker::connect_with_local_defaults().unwrap();
    let result = docker.list_networks::<String>(None).await;
    assert!(result.is_ok(), "Should list networks");
}

#[tokio::test]
async fn test_list_volumes() {
    let docker = Docker::connect_with_local_defaults().unwrap();
    let result = docker.list_volumes::<String>(None).await;
    assert!(result.is_ok(), "Should list volumes");
}
